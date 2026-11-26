# Pulso · API REST IoT

**Sistemas Distribuídos · Avaliação IV**

Luiz Gabriel e Pedro Butzke

Sistema local com um simulador próprio de quatro sensores, API REST em Python, persistência SQLite e dashboard que consulta a API por HTTP. Inclui uma apresentação HTML de cinco slides para uma introdução de até dois minutos, antes da demonstração prática.

## Material para estudar e apresentar

- [Relatório simples da implementação](docs/RELATORIO_IMPLEMENTACAO.md)
- [Roteiro completo do vídeo para Pedro e Luiz](docs/ROTEIRO_APRESENTACAO.md), com um bloco contínuo por pessoa e uma única passagem de fala
- [Mensagem pronta para Pedro](docs/MENSAGEM_PEDRO.md)

O vídeo completo não tem duração definida neste roteiro. Os slides são apenas sua introdução; o desenvolvimento inclui explicação do código e demonstração prática.

## Executar

Requer Python 3.11 ou superior. No PowerShell, na pasta do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
```

Linux/macOS: use `.venv/bin/python` nos dois últimos comandos. Não é necessário Node.js nem compilar o frontend.

- Dashboard: <http://localhost:8080/>
- Apresentação: <http://localhost:8080/apresentacao>
- Contrato OpenAPI: <http://localhost:8080/openapi.json>
- Documentação interativa: <http://localhost:8080/docs>

`run.py` inicia a API e o simulador em **processos separados**. Ctrl+C encerra ambos. O banco e a fila de reenvio ficam em `data/` e são preservados. A apresentação também pode ser aberta diretamente pelo arquivo `web/apresentacao.html`, sem servidor. Use as setas; o último slide contém um link para o dashboard local.

### Docker

Com Docker Desktop iniciado e o mecanismo Linux disponível:

```powershell
docker compose up --build -d
docker compose logs -f simulator
```

Os mesmos endereços ficam disponíveis. A API só é publicada na interface local. O simulador usa a rede interna do Compose (`http://api:8080`), pois cada container tem seu próprio localhost. O healthcheck libera sua inicialização após a API responder. Os volumes `readings` e `outbox` preservam os dados.

```powershell
docker compose stop simulator
docker compose start simulator
docker compose down
```

`down` preserva os volumes. **`down -v` apaga permanentemente os dados do Docker.** Não execute API nativa e Docker na mesma porta ao mesmo tempo.

### Executar os componentes individualmente

Terminal 1:

```powershell
python -m uvicorn app.main:app --host localhost --port 8080
```

Terminal 2:

```powershell
python simulator.py --interval 2
```

O simulador aceita `--url`, `--interval` (segundos), `--cycles` (0 = contínuo), `--seed` e `--outbox`. Exemplo de execução finita: `python simulator.py --cycles 10 --interval 1 --seed 42`. A semente torna os valores reproduzíveis; os timestamps continuam sendo os instantes reais da geração. `DATABASE_PATH`, `API_URL` e `OUTBOX_PATH` permitem configurar os caminhos por variáveis de ambiente.

## Funcionamento

```text
Simulador Python -- POST JSON --> API FastAPI -- transação --> SQLite
                                     ^                         |
                                     |                         |
Dashboard HTML/JS -- GET HTTP --------+------ consultas --------+
```

O simulador gera T010 (temperatura), H010 (umidade), L010 (luminosidade) e M010 (movimento). As três primeiras grandezas usam oscilações e ruído; movimento usa 0 ou 1. Um ciclo gera quatro mensagens com timestamp UTC ISO 8601. O intervalo é contado entre inícios de ciclo; comunicação lenta pode alongá-lo.

Antes de enviar, cada mensagem entra em uma fila SQLite local. Uma confirmação HTTP 200/201 remove a mensagem. Falhas transitórias mantêm os dados e provocam novas tentativas com espera crescente, limitada a 30 segundos, enquanto novos ciclos continuam gerando leituras. A fila é processada em lotes de até 100 por ciclo. Rejeições permanentes (por exemplo, 422 ou 409) são preservadas na tabela `rejected` da fila e registradas nos logs, sem bloquear as demais mensagens.

A API valida o contrato e grava cada leitura em uma transação. O par **sensorId + timestamp** identifica uma leitura: reenviar o mesmo valor retorna 200 sem duplicar o registro; reenviar outro valor para o mesmo instante retorna 409. O tipo fica associado ao identificador do sensor e não pode mudar. Isso trata a situação em que a API grava, mas a resposta se perde antes de chegar ao cliente. A entrega usa novas tentativas; não há promessa de entrega única pelo HTTP.

O dashboard consulta a API a cada dois segundos. Mostra a última leitura de cada tipo, seleciona sensores individuais para o gráfico, desenha até 240 leituras mais recentes e oferece histórico paginado com filtros por tipo, identificador e período. Datas são exibidas no fuso do navegador. Os filtros do histórico também valem para o CSV; o período vale para o gráfico, enquanto os cards mantêm as últimas leituras de todo o ambiente. Filtros, seleção e densidade da tabela sobrevivem à recarga. Cada registro pode ser inspecionado em um painel lateral. **Pausar atualização** pausa somente as consultas automáticas do painel. Os controles continuam consultando sob demanda, e o simulador continua enviando dados.

As decisões do redesign e a aplicação dos conceitos do relatório UniFi estão em `docs/UI.md`.

## API

| Método e caminho | Finalidade |
| --- | --- |
| `POST /api/sensor/data` | Recebe uma leitura: 201 para nova; 200 para reenvio idêntico |
| `GET /api/sensor/data` | Histórico com `items`, `total`, `limit`, `offset` |
| `GET /api/sensor/summary` | Contagem, sensores e última leitura de cada sensor |
| `GET /api/sensor/export` | CSV com todos os registros filtrados, até 50.000 |
| `GET /api/health` | Confirma acesso ao banco |

As três consultas de dados aceitam `type`, `sensorId`, `since` e `until`. Datas de filtro exigem ISO 8601 com fuso. Histórico aceita `limit` (1 a 500) e `offset` (a partir de zero), ordenando por **instante da leitura** e ID decrescentes. Exportações acima de 50.000 registros retornam 422 e pedem um período menor.

```json
{
  "sensorId": "T010",
  "type": "temperature",
  "value": 23.5,
  "timestamp": "2026-11-24T14:32:55Z"
}
```

Tipos aceitos: `temperature`, `humidity`, `luminosity`, `motion`. Faixas da aplicação: -50 a 100 °C; 0 a 100%; 0 a 200.000 lx; movimento 0/1. Esses limites são escolhas do projeto. Valores precisam ser números finitos, sem coerção de texto ou booleano. Identificadores aceitam letras ASCII, números, `_` e `-`, até 40 caracteres. Campos extras e timestamps sem fuso são rejeitados com 422; conflitos de identidade retornam 409.

Exemplo PowerShell (use um instante novo para uma nova leitura):

```powershell
$leitura = @{
  sensorId = 'T010'
  type = 'temperature'
  value = 23.5
  timestamp = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/api/sensor/data -Method Post -ContentType application/json -Body $leitura
Invoke-RestMethod -Uri 'http://localhost:8080/api/sensor/data?type=temperature&limit=5'
```

## Organização

```text
app/main.py           Rotas HTTP, filtros, exportação e arquivos estáticos
app/models.py         Contrato JSON e validação
app/database.py       Conexões, esquema e índices SQLite
simulator.py          Geração, envio HTTP, fila e tratamento de falhas
run.py                Inicialização dos dois processos locais
web/index.html        Dashboard
web/dashboard.js      Consumo REST e gráficos em Canvas
web/style.css         Interface responsiva
web/apresentacao.html Apresentação autônoma em HTML
tests/                Testes da API e do simulador
docs/                 Requisitos e notas de arquitetura
compose.yaml          API e simulador em containers separados
```

## Banco e persistência

O arquivo nativo é `data/iot.db`. `sensors(sensor_id, type)` cadastra a identidade; `readings(id, sensor_id, value, timestamp)` guarda múltiplas leituras com chave estrangeira. Timestamps são normalizados para UTC com precisão fixa antes de comparar ou ordenar. Há índices por instante e por sensor/instante, restrição de unicidade e WAL para permitir leitura durante escritas. As conexões são fechadas após cada operação; consultas SQL usam parâmetros.

Para conferir diretamente, com a aplicação executando:

```powershell
python -c "import sqlite3; c=sqlite3.connect('data/iot.db'); print(c.execute('SELECT sensor_id, COUNT(*) FROM readings GROUP BY sensor_id').fetchall()); c.close()"
```

## Verificação

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
docker compose config --quiet
```

Os testes usam bancos temporários: persistência após reinício, quatro tipos, JSON inválido, limites e valores não finitos, filtros, paginação, ordenação, CSV, reenvios concorrentes, fila após indisponibilidade e recuperação, e isolamento de mensagens rejeitadas.

Para demonstrar uma falha real, execute os componentes em terminais separados, pare somente a API, deixe o simulador gerar alguns ciclos e reinicie a API. Acompanhe a fila sendo entregue e os registros aparecendo no dashboard. Reiniciar o simulador também preserva a fila pendente.

## Entrega da avaliação

O mapa em `docs/REQUISITOS.md` relaciona os itens do enunciado aos arquivos. A apresentação cobre proposta, sensores, componentes, implementação e transição para a aplicação. **O PDF também exige um vídeo em que os dois integrantes explicam o código e demonstram a integração. Essa gravação deve ser feita pela dupla e anexada à entrega.** O projeto e os slides não substituem esse vídeo.

Esta solução foi projetada para demonstração local: não inclui autenticação, TLS, replicação de banco ou retenção automática. O SQLite fica junto da API; o caráter distribuído aparece nos processos independentes e na comunicação HTTP, mesmo usando uma única máquina. Sem dependências remotas no dashboard ou nos slides; a página Swagger `/docs` usa os recursos de CDN padrão do FastAPI e pode precisar de internet. O contrato `/openapi.json` funciona localmente.

Referências técnicas: [FastAPI: testes](https://fastapi.tiangolo.com/tutorial/testing/), [Python: sqlite3](https://docs.python.org/3/library/sqlite3.html), [Docker: ordem de inicialização](https://docs.docker.com/compose/how-tos/startup-order/).
