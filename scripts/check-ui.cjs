const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL || 'http://127.0.0.1:8080';
require('node:fs').mkdirSync('tmp/unifi',{recursive:true});
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {channel:'chrome'}),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByText('API conectada',{exact:true}).waitFor();
  assert.equal(await page.locator('.sensor-card').count(),4);
  assert.equal(await page.locator('.sensor-card[aria-pressed="true"]').getAttribute('data-type'),'temperature');
  await page.screenshot({path:'tmp/unifi/dashboard-desktop.png',fullPage:true});
  // O foco permanece no mesmo componente durante o polling.
  await page.locator('[data-type="humidity"]').focus();
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.type),'humidity');
  await page.locator('[data-type="humidity"]').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#chart-title').textContent.startsWith('Umidade'));
  assert.equal(await page.locator('#inspector-type').textContent(),'Umidade');
  await page.locator('#filter-period').selectOption('5');
  await page.locator('#filter-type').selectOption('humidity');
  await page.locator('#density').selectOption('comfortable');
  await page.waitForFunction(()=>[...document.querySelectorAll('#readings tr')].every(row=>row.textContent.includes('Umidade')));
  assert.equal(await page.locator('#active-filters .filter-chip').count(),2);
  await page.reload();await page.getByText('API conectada',{exact:true}).waitFor();
  assert.equal(await page.locator('#filter-period').inputValue(),'5');
  assert.equal(await page.locator('#filter-type').inputValue(),'humidity');
  assert.equal(await page.locator('#density').inputValue(),'comfortable');
  assert.equal(await page.locator('.sensor-card[aria-pressed="true"]').getAttribute('data-type'),'humidity');
  const details=page.locator('.inspect-reading').first();await details.click();
  await page.locator('#reading-detail[open]').waitFor();
  const title=await page.locator('#detail-title').textContent();
  await page.waitForTimeout(2200);assert.equal(await page.locator('#detail-title').textContent(),title);
  await page.screenshot({path:'tmp/unifi/detail-desktop.png',fullPage:false});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#reading-detail').evaluate(el=>el.open),false);
  assert.ok(await page.locator('.inspect-reading:focus').count());
  assert.equal(await page.locator('#filter-period').inputValue(),'5');
  await page.locator('#sensor-history').click();
  await page.waitForFunction(()=>document.querySelector('#filter-sensor').value==='H010');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  assert.equal((await downloadPromise).suggestedFilename(),'leituras-iot.csv');
  await page.locator('#pause').click();assert.equal(await page.locator('#pause').getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('#collection-status').textContent()).includes('pausada'));
  await page.locator('#pause').click();
  await page.locator('#clear-filters').click();
  await page.waitForFunction(()=>document.querySelector('#filter-type').value==='');
  await page.locator('#density').selectOption('compact');
  await page.locator('[data-type="temperature"]').click();
  for(const [width,height] of [[1024,768],[768,1024],[390,844],[320,800]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow '+width);
   await page.screenshot({path:'tmp/unifi/dashboard-'+width+'.png',fullPage:true});
  }
  await page.locator('.inspect-reading').first().click();
  assert.ok(await page.locator('#reading-detail').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
  await page.screenshot({path:'tmp/unifi/detail-mobile.png',fullPage:false});await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#filter-period').focus();
  // Falha de comunicação: mantém o último conjunto de dados e explicita incerteza.
  await page.route('**/api/sensor/**',route=>route.abort());
  await page.getByText('API sem conexão',{exact:true}).waitFor();
  assert.ok((await page.locator('#notice').textContent()).includes('não estão confirmados'));
  assert.ok((await page.locator('.card-value').first().textContent())!=='—');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'tmp/unifi/offline.png',fullPage:true});
  await page.unroute('**/api/sensor/**');await page.getByText('API conectada',{exact:true}).waitFor();
  assert.equal(await page.locator('#notice').isVisible(),false);
  // O servidor está disponível, mas os timestamps comprovam coleta atrasada.
  const summary=await (await page.request.get(base+'/api/sensor/summary')).json();
  summary.latest.forEach(r=>r.timestamp='2026-01-01T12:00:00Z');
  await page.route('**/api/sensor/summary',route=>route.fulfill({json:summary}));
  await page.waitForFunction(()=>document.getElementById('collection-status').textContent.includes('atrasada'));
  assert.equal(await page.locator('#connection').textContent(),'API conectada');
  await page.screenshot({path:'tmp/unifi/stale.png',fullPage:true});
  await page.unroute('**/api/sensor/summary');
  // Banco vazio e filtros sem resultados têm mensagens diferentes.
  await page.route('**/api/sensor/summary',route=>route.fulfill({json:{total:0,sensors:0,lastReading:null,latest:[]}}));
  await page.route('**/api/sensor/data?*',route=>route.fulfill({json:{items:[],total:0,limit:20,offset:0}}));
  await page.waitForFunction(()=>document.querySelector('#readings').textContent.includes('Nenhuma leitura recebida'));
  await page.locator('#filter-type').selectOption('motion');
  await page.waitForFunction(()=>document.querySelector('#readings').textContent.includes('Nenhuma leitura neste filtro'));
  await page.screenshot({path:'tmp/unifi/empty-filter.png',fullPage:true});
  await page.unroute('**/api/sensor/summary');await page.unroute('**/api/sensor/data?*');
  await page.locator('#clear-filters').click();
  await page.getByText('API conectada',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#readings .inspect-reading').length>0);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'tmp/unifi/dashboard-final.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: seleção/foco no polling, preferências após recarga, detalhes/retorno, filtros, CSV, pausa, 4 larguras, offline/recuperação, atraso e vazio. Sem erros JS.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
