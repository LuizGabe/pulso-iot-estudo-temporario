'use strict';

const kinds = {
  temperature: {name: 'Temperatura', unit: '°C'},
  humidity: {name: 'Umidade', unit: '%'},
  luminosity: {name: 'Luminosidade', unit: 'lx'},
  motion: {name: 'Movimento', unit: ''}
};
const $ = id => document.getElementById(id);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const number = (value, digits = 1) => Number(value).toLocaleString('pt-BR', {maximumFractionDigits: digits});
const valueLabel = reading => reading.type === 'motion' ? (reading.value ? 'Detectado' : 'Sem movimento') : number(reading.value);
const clock = stamp => new Date(stamp).toLocaleTimeString('pt-BR');
const dateTime = stamp => new Date(stamp).toLocaleString('pt-BR');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const state = {
  type: 'temperature', sensor: '', paused: false, offset: 0, total: 0,
  points: [], latest: [], busy: false, pending: false, chartRequest: 0,
  filterVersion: 0, connected: false, loaded: false, lastRefresh: null,
  rows: [], pendingTable: null, selectedReading: null, noticeKind: ''
};
const STORAGE = 'pulso.console.preferences.v2';
function preferences() {
  try { return JSON.parse(localStorage.getItem(STORAGE)) || {}; } catch { return {}; }
}
function savePreferences() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({
      type: state.type, sensor: state.sensor,
      filterType: $('filter-type').value, filterSensor: $('filter-sensor').value,
      period: $('filter-period').value, density: $('density').value
    }));
  } catch { /* A interface permanece funcional quando o armazenamento está bloqueado. */ }
}
function restorePreferences() {
  const saved = preferences();
  if (Object.hasOwn(kinds, saved.type)) state.type = saved.type;
  if (typeof saved.sensor === 'string') state.sensor = saved.sensor;
  if (Object.hasOwn(kinds, saved.filterType)) $('filter-type').value = saved.filterType;
  if (['', '5', '30', '60'].includes(saved.period)) $('filter-period').value = saved.period;
  if (saved.density === 'comfortable') $('density').value = saved.density;
  if (typeof saved.filterSensor === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(saved.filterSensor)) {
    $('filter-sensor').add(new Option(saved.filterSensor, saved.filterSensor));
    $('filter-sensor').value = saved.filterSensor;
  }
  applyDensity();
}
function applyDensity() {
  $('history').classList.toggle('comfortable', $('density').value === 'comfortable');
}
function ageSeconds(stamp) { return Math.max(0, Math.floor((Date.now() - new Date(stamp)) / 1000)); }
function age(stamp) {
  const seconds = ageSeconds(stamp);
  return seconds < 60 ? 'há ' + seconds + 's' : seconds < 3600 ? 'há ' + Math.floor(seconds / 60) + 'min' : seconds < 86400 ? 'há ' + Math.floor(seconds / 3600) + 'h' : 'há ' + Math.floor(seconds / 86400) + 'd';
}
function readingStatus(reading) {
  if (!reading) return {text: 'Sem dados', className: 'empty-state'};
  if (!state.connected) return {text: 'Não confirmado', className: 'empty-state'};
  if (state.paused) return {text: 'Em pausa', className: 'empty-state'};
  return ageSeconds(reading.timestamp) > 15 ? {text: 'Atrasado', className: 'stale'} : {text: 'Atualizado', className: ''};
}
function queryFilters() {
  const query = new URLSearchParams();
  if ($('filter-type').value) query.set('type', $('filter-type').value);
  if ($('filter-sensor').value) query.set('sensorId', $('filter-sensor').value);
  const minutes = Number($('filter-period').value);
  if (minutes) query.set('since', new Date(Date.now() - minutes * 60000).toISOString());
  return query;
}
async function get(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
function buildCards() {
  $('cards').innerHTML = Object.entries(kinds).map(([type, kind]) =>
    '<button class="sensor-card" data-type="' + type + '" aria-pressed="false">' +
    '<span class="sensor-top">' + icon(type) + '<span>' + kind.name + '</span><span class="card-status empty-state">Sem dados</span></span>' +
    '<span class="reading-value' + (type === 'motion' ? ' motion' : '') + '"><span class="card-value">—</span><span class="unit">' + kind.unit + '</span></span>' +
    '<span class="sensor-bottom"><span class="sensor-id">Aguardando</span><span class="sensor-age">—</span></span></button>'
  ).join('');
  $('cards').addEventListener('click', event => {
    const card = event.target.closest('[data-type]');
    if (!card) return;
    state.type = card.dataset.type; state.sensor = ''; savePreferences(); renderCards();
    loadChart().catch(showError);
  });
}
function renderCards() {
  document.querySelectorAll('.sensor-card').forEach(card => {
    const type = card.dataset.type;
    const reading = state.latest.filter(r => r.type === type).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    const status = readingStatus(reading);
    card.classList.toggle('selected', state.type === type);
    card.setAttribute('aria-pressed', String(state.type === type));
    card.setAttribute('aria-label', kinds[type].name + ': ' + (reading ? valueLabel(reading) + ' ' + kinds[type].unit : 'sem dados') + '. ' + status.text + '. Selecionar gráfico.');
    card.querySelector('.card-value').textContent = reading ? valueLabel(reading) : '—';
    card.querySelector('.sensor-id').textContent = reading ? reading.sensorId : 'Aguardando';
    card.querySelector('.sensor-age').textContent = reading ? age(reading.timestamp) : '—';
    card.querySelector('.sensor-age').title = reading ? dateTime(reading.timestamp) : '';
    const badge = card.querySelector('.card-status');
    badge.className = 'card-status ' + status.className; badge.textContent = status.text;
  });
  $('cards').setAttribute('aria-busy', String(!state.loaded && !state.noticeKind));
  const collection = $('collection-status');
  const fresh = state.latest.filter(r => ageSeconds(r.timestamp) <= 15).length;
  let text = 'Aguardando coleta', className = 'neutral';
  if (!state.connected && state.loaded) text = 'Estado da coleta não confirmado';
  else if (state.paused) text = 'Atualização do painel pausada';
  else if (state.latest.length && fresh === state.latest.length) { text = 'Coleta ativa · ' + fresh + ' sensores'; className = ''; }
  else if (state.latest.length) { const delayed = state.latest.length - fresh; text = delayed === 1 ? '1 sensor com coleta atrasada' : delayed + ' sensores com coleta atrasada'; className = 'warning'; }
  collection.className = 'status-label ' + className;
  collection.innerHTML = '<i></i>' + escapeHtml(text);
}
function setOptions(select, options, selected) {
  const signature = JSON.stringify(options);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...options.map(item => new Option(item.label, item.value)));
    select.dataset.options = signature;
  }
  select.value = selected;
}
function syncSensorFilter() {
  const selected = $('filter-sensor').value;
  const type = $('filter-type').value;
  const sensors = state.latest.filter(r => !type || r.type === type);
  const options = [{value: '', label: 'Todos os sensores'}, ...sensors.map(r => ({value: r.sensorId, label: r.sensorId}))];
  if (selected && !sensors.some(r => r.sensorId === selected)) options.push({value: selected, label: selected});
  setOptions($('filter-sensor'), options, selected);
}
function renderFilterChips() {
  const filters = [
    {id: 'filter-type', label: $('filter-type').value ? kinds[$('filter-type').value].name : ''},
    {id: 'filter-sensor', label: $('filter-sensor').value},
    {id: 'filter-period', label: $('filter-period').value ? $('filter-period').selectedOptions[0].textContent : ''}
  ].filter(item => item.label);
  $('active-filters').hidden = !filters.length;
  $('clear-filters').hidden = !filters.length;
  $('active-filters').innerHTML = filters.map(item =>
    '<button class="filter-chip" data-clear="' + item.id + '" aria-label="Remover filtro ' + escapeHtml(item.label) + '">' + escapeHtml(item.label) + '<span aria-hidden="true">×</span></button>'
  ).join('');
}
function renderTable(data, force = false) {
  // Mantém o registro e o foco enquanto o operador inspeciona ou navega pelo teclado.
  if (!force && ($('reading-detail').open || $('readings').contains(document.activeElement))) {
    state.pendingTable = data; return;
  }
  state.pendingTable = null; state.rows = data.items; state.total = data.total;
  $('total').textContent = number(data.total, 0);
  const hasFilters = queryFilters().size > 0;
  $('readings').innerHTML = data.items.length ? data.items.map(reading =>
    '<tr><td class="sensor-cell">' + icon(reading.type) + escapeHtml(reading.sensorId) + '</td>' +
    '<td><span class="type-label"><i class="type-dot"></i>' + kinds[reading.type].name + '</span></td>' +
    '<td class="numeric">' + valueLabel(reading) + '<span class="table-unit">' + kinds[reading.type].unit + '</span></td>' +
    '<td>' + dateTime(reading.timestamp) + '</td><td>#' + String(reading.id).padStart(5, '0') + '</td>' +
    '<td><button class="button inspect-reading" data-reading="' + reading.id + '" aria-label="Inspecionar leitura ' + reading.id + ' do sensor ' + escapeHtml(reading.sensorId) + '">' + icon('arrow') + '</button></td></tr>'
  ).join('') :
    '<tr><td colspan="6" class="empty"><strong>' + (hasFilters ? 'Nenhuma leitura neste filtro' : 'Nenhuma leitura recebida') + '</strong><span>' +
    (hasFilters ? 'Amplie o período ou limpe os filtros para consultar outros registros.' : 'Inicie o simulador para receber os primeiros dados do ambiente.') + '</span></td></tr>';
  $('pagination-info').textContent = data.total ? (state.offset + 1) + '–' + Math.min(state.offset + 20, data.total) + ' de ' + number(data.total, 0) + ' registros' : '0 registros';
  $('page').textContent = String(Math.floor(state.offset / 20) + 1).padStart(2, '0');
  $('previous').disabled = state.offset === 0; $('next').disabled = state.offset + 20 >= data.total;
}
function renderInspector() {
  const kind = kinds[state.type];
  const reading = state.latest.find(r => r.sensorId === state.sensor);
  const status = readingStatus(reading);
  $('inspector-icon').innerHTML = icon(state.type);
  $('inspector-id').textContent = reading ? reading.sensorId : 'Sem leitura';
  $('inspector-type').textContent = kind.name;
  $('inspector-value').textContent = reading ? valueLabel(reading) + ' ' + kind.unit : '—';
  $('inspector-time').textContent = reading ? clock(reading.timestamp) : '—';
  $('inspector-status').textContent = status.text;
  $('inspector-status').className = status.className === 'stale' ? 'warning' : status.className ? '' : 'good';
  $('sensor-history').disabled = !reading;
}
async function loadChart() {
  const request = ++state.chartRequest;
  const candidates = state.latest.filter(r => r.type === state.type).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (!candidates.some(r => r.sensorId === state.sensor)) state.sensor = candidates[0]?.sensorId || '';
  setOptions($('chart-sensor'), candidates.length ? candidates.map(r => ({value: r.sensorId, label: r.sensorId})) : [{value: '', label: 'Sem sensor'}], state.sensor);
  $('chart-title').textContent = kinds[state.type].name + ' ao longo do tempo';
  $('chart-legend').textContent = kinds[state.type].name + (kinds[state.type].unit ? ' · ' + kinds[state.type].unit : ' · 0 / 1');
  renderInspector(); savePreferences();
  const query = new URLSearchParams({type: state.type, limit: '240'});
  if (state.sensor) query.set('sensorId', state.sensor);
  const minutes = Number($('filter-period').value);
  if (minutes) query.set('since', new Date(Date.now() - minutes * 60000).toISOString());
  const result = await get('/api/sensor/data?' + query);
  if (request !== state.chartRequest) return;
  state.points = result.items.slice().reverse();
  const values = state.points.map(r => r.value);
  $('chart-info').textContent = state.sensor ? state.sensor + ' · ' + (minutes ? $('filter-period').selectedOptions[0].textContent : 'Leituras mais recentes') : 'Aguardando um sensor deste tipo';
  $('chart-range').textContent = values.length ? 'Mín. ' + number(Math.min(...values)) + ' / Máx. ' + number(Math.max(...values)) : 'Sem amostras';
  $('chart-count').textContent = values.length + ' amostras';
  $('chart-window').textContent = 'Até 240 leituras' + (minutes ? ' no período selecionado' : ' mais recentes') + ' · horário local';
  $('chart-empty').hidden = values.length > 0;
  $('chart-empty').querySelector('strong').textContent = state.latest.length ? 'Sem leituras neste período' : 'Aguardando leituras';
  $('chart-empty').querySelector('span').textContent = state.latest.length ? 'Amplie o período ou selecione outro sensor.' : 'O gráfico aparece assim que o sensor enviar dados.';
  drawChart();
}
function drawChart() {
  const canvas = $('chart'), box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  if (!box.width || !box.height) return;
  canvas.width = box.width * ratio; canvas.height = box.height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const width = box.width, height = box.height, left = 48, right = 16, top = 18, bottom = 32;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const points = state.points, values = points.map(point => point.value);
  let low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 100;
  if (state.type === 'motion') { low = 0; high = 1; }
  else { const pad = Math.max((high - low) * .2, 1); low = Math.max(state.type === 'temperature' ? -50 : 0, low - pad); high += pad; }
  ctx.font = '10px Segoe UI'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = top + plotHeight * i / 4;
    ctx.strokeStyle = '#edf0f5'; ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(width - right, y + .5); ctx.stroke();
    ctx.fillStyle = '#647187'; ctx.textAlign = 'right';
    ctx.fillText(number(high - (high - low) * i / 4), left - 10, y + 3);
  }
  if (!points.length) { canvas.setAttribute('aria-label', 'Sem amostras para o sensor selecionado'); return; }
  const first = new Date(points[0].timestamp).getTime(), last = new Date(points.at(-1).timestamp).getTime();
  const x = point => left + (last === first ? .5 : (new Date(point.timestamp) - first) / (last - first)) * plotWidth;
  const y = point => top + (high - point.value) / (high - low) * plotHeight;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (!index) ctx.moveTo(x(point), y(point));
    else { if (state.type === 'motion') ctx.lineTo(x(point), y(points[index - 1])); ctx.lineTo(x(point), y(point)); }
  });
  ctx.strokeStyle = '#006eff'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo(x(points.at(-1)), top + plotHeight); ctx.lineTo(x(points[0]), top + plotHeight); ctx.closePath();
  const gradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
  gradient.addColorStop(0, '#006eff15'); gradient.addColorStop(1, '#006eff00'); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); ctx.arc(x(points.at(-1)), y(points.at(-1)), 3, 0, Math.PI * 2); ctx.fillStyle = '#006eff'; ctx.fill();
  const indices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  indices.forEach((index, i) => {
    ctx.fillStyle = '#647187'; ctx.textAlign = i === 0 ? 'left' : i === indices.length - 1 ? 'right' : 'center';
    ctx.fillText(clock(points[index].timestamp), x(points[index]), height - 10);
  });
  canvas.setAttribute('aria-label', kinds[state.type].name + ': ' + points.length + ' amostras; mínimo ' + number(Math.min(...values)) + ', máximo ' + number(Math.max(...values)) + ' ' + kinds[state.type].unit);
}
function showError(error) {
  state.connected = false;
  $('connection').textContent = 'API sem conexão'; $('connection-dot').className = 'error';
  $('notice').hidden = false; state.noticeKind = 'connection';
  $('notice').textContent = 'Não foi possível consultar a API (' + error.message + '). ' +
    (state.loaded ? 'Os últimos dados permanecem visíveis e não estão confirmados. ' : 'Aguardando conexão para consultar os dados. ') +
    (state.paused ? 'Retome a atualização para tentar novamente.' : 'O painel tentará novamente automaticamente.');
  if (!state.loaded) {
    $('cards').setAttribute('aria-busy', 'false');
    $('readings').innerHTML = '<tr><td colspan="6" class="empty"><strong>Histórico indisponível</strong><span>Os registros serão exibidos quando a conexão for restabelecida.</span></td></tr>';
    $('pagination-info').textContent = 'Consulta indisponível';
  }
  renderCards(); renderInspector();
}
async function refresh(force = false) {
  if (state.busy) { if (force) state.pending = true; return; }
  if (!force && state.paused) return;
  state.busy = true;
  const version = state.filterVersion;
  try {
    const query = queryFilters(); query.set('limit', '20'); query.set('offset', state.offset);
    const [summary, table] = await Promise.all([get('/api/sensor/summary'), get('/api/sensor/data?' + query)]);
    state.latest = summary.latest; state.connected = true; state.loaded = true; state.lastRefresh = new Date();
    syncSensorFilter(); renderCards();
    if (version === state.filterVersion) {
      if (state.offset >= table.total && state.offset > 0) {
        state.offset = Math.max(0, Math.floor((table.total - 1) / 20) * 20); state.pending = true;
      } else renderTable(table);
    }
    $('sensor-count').textContent = summary.sensors;
    await loadChart();
    $('connection').textContent = 'API conectada'; $('connection-dot').className = 'ok';
    if (state.noticeKind === 'connection') { $('notice').hidden = true; state.noticeKind = ''; }
    $('updated').textContent = state.paused ? 'Painel pausado · coleta continua' : 'Consultado às ' + clock(state.lastRefresh);
  } catch (error) { showError(error); }
  finally {
    state.busy = false;
    if (state.pending) { state.pending = false; refresh(true); }
  }
}
function filtersChanged() {
  state.offset = 0; state.filterVersion++; state.pendingTable = null;
  syncSensorFilter(); renderFilterChips(); savePreferences(); refresh(true);
}
function viewSensorHistory(reading) {
  if (!reading) return;
  $('filter-type').value = reading.type; syncSensorFilter();
  if (![...$('filter-sensor').options].some(option => option.value === reading.sensorId)) $('filter-sensor').add(new Option(reading.sensorId, reading.sensorId));
  $('filter-sensor').value = reading.sensorId;
  state.type = reading.type; state.sensor = reading.sensorId;
  filtersChanged(); $('history').scrollIntoView({block: 'start'});
}
function inspectReading(reading) {
  state.selectedReading = reading;
  $('detail-title').textContent = 'Leitura #' + String(reading.id).padStart(5, '0');
  $('detail-reading').innerHTML = '<span class="reading-label">' + icon(reading.type) + kinds[reading.type].name + '</span><span class="reading-value' + (reading.type === 'motion' ? ' motion' : '') + '">' + valueLabel(reading) + '<span class="unit">' + kinds[reading.type].unit + '</span></span>';
  const properties = [['Sensor', reading.sensorId], ['Tipo', kinds[reading.type].name], ['Data e hora local', dateTime(reading.timestamp)], ['Persistência', 'Armazenado em SQLite'], ['Origem', 'Simulador IoT']];
  $('detail-properties').innerHTML = properties.map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('');
  const {sensorId, type, value, timestamp} = reading;
  $('detail-json').textContent = JSON.stringify({sensorId, type, value, timestamp}, null, 2);
  $('reading-detail').showModal();
}
$('pause').addEventListener('click', () => {
  state.paused = !state.paused;
  $('pause').innerHTML = icon(state.paused ? 'play' : 'pause') + '<span>' + (state.paused ? 'Retomar atualização' : 'Pausar atualização') + '</span>';
  $('pause').setAttribute('aria-pressed', String(state.paused));
  $('pause').setAttribute('aria-label', (state.paused ? 'Retomar' : 'Pausar') + ' atualização automática do painel');
  $('pause').title = state.paused ? 'Retoma as consultas automáticas; o simulador continuou enviando dados' : 'Pausa apenas a atualização automática do painel';
  $('updated').textContent = state.paused ? 'Painel pausado · coleta continua' : 'Retomando atualização…';
  renderCards(); renderInspector(); if (!state.paused) refresh(true);
});
$('filter-type').addEventListener('change', () => {
  const selected = state.latest.find(r => r.sensorId === $('filter-sensor').value);
  if (selected && $('filter-type').value && selected.type !== $('filter-type').value) $('filter-sensor').value = '';
  filtersChanged();
});
for (const id of ['filter-sensor', 'filter-period']) $(id).addEventListener('change', filtersChanged);
$('clear-filters').addEventListener('click', () => {
  for (const id of ['filter-type', 'filter-sensor', 'filter-period']) $(id).value = '';
  filtersChanged();
});
$('active-filters').addEventListener('click', event => {
  const chip = event.target.closest('[data-clear]');
  if (chip) { $(chip.dataset.clear).value = ''; filtersChanged(); }
});
$('density').addEventListener('change', () => { applyDensity(); savePreferences(); });
$('previous').addEventListener('click', () => { state.offset = Math.max(0, state.offset - 20); state.filterVersion++; refresh(true); });
$('next').addEventListener('click', () => { state.offset += 20; state.filterVersion++; refresh(true); });
$('chart-sensor').addEventListener('change', event => { state.sensor = event.target.value; savePreferences(); loadChart().catch(showError); });
$('sensor-history').addEventListener('click', () => viewSensorHistory(state.latest.find(r => r.sensorId === state.sensor)));
$('readings').addEventListener('click', event => {
  const button = event.target.closest('[data-reading]');
  if (button) { const reading = state.rows.find(r => r.id === Number(button.dataset.reading)); if (reading) inspectReading(reading); }
});
$('readings').addEventListener('focusout', () => {
  setTimeout(() => { if (state.pendingTable && !$('reading-detail').open && !$('readings').contains(document.activeElement)) renderTable(state.pendingTable, true); }, 0);
});
$('close-detail').addEventListener('click', () => $('reading-detail').close());
$('detail-history').addEventListener('click', () => {
  $('reading-detail').close(); $('filter-sensor').focus({preventScroll: true}); viewSensorHistory(state.selectedReading);
});
$('reading-detail').addEventListener('close', () => {
  if (state.pendingTable && !$('readings').contains(document.activeElement)) renderTable(state.pendingTable, true);
});
$('export').addEventListener('click', async () => {
  const button = $('export'); button.disabled = true; button.innerHTML = icon('download') + ' Exportando…';
  try {
    const response = await fetch('/api/sensor/export?' + queryFilters(), {signal: AbortSignal.timeout(15000)});
    if (!response.ok) { const body = await response.json(); throw new Error(body.detail || 'HTTP ' + response.status); }
    const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'leituras-iot.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (state.noticeKind === 'export') { $('notice').hidden = true; state.noticeKind = ''; }
  } catch (error) {
    $('notice').hidden = false; state.noticeKind = 'export'; $('notice').textContent = 'Exportação não concluída: ' + error.message;
  } finally { button.disabled = false; button.innerHTML = icon('download') + ' Exportar CSV'; }
});
function updateNavigation() {
  const historyTop = $('history').getBoundingClientRect().top;
  const historyVisible = historyTop < Math.max(120, window.innerHeight * .4);
  for (const link of document.querySelectorAll('nav a[href^="#"]')) {
    const selected = link.hash === (historyVisible ? '#history' : '#overview');
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}
window.addEventListener('scroll', updateNavigation, {passive: true});
new ResizeObserver(drawChart).observe($('chart'));
restorePreferences(); buildCards(); renderCards(); renderFilterChips(); refresh();
setInterval(refresh, 2000);
setInterval(() => { renderCards(); renderInspector(); }, 1000);
