# Relatório de implementação do Pulso IoT

**Integrantes:** Luiz Gabriel e Pedro Butzke

**Disciplina:** Sistemas Distribuídos

## Objetivo

Implementamos um sistema para gerar, receber, armazenar e visualizar leituras de sensores IoT simulados. A solução reúne um simulador próprio, uma API REST e uma aplicação web. Os componentes se comunicam por HTTP, e os dados ficam persistidos em SQLite.

## Tecnologias e organização

Usamos Python no simulador e na API, com FastAPI para as rotas HTTP e Pydantic para validar os dados. O dashboard foi construído com HTML, CSS e JavaScript, usando Canvas para o gráfico. O navegador não precisa de bibliotecas ou fontes externas para exibir o painel.

| Arquivo | Responsabilidade |
| --- | --- |
| [simulator.py](../simulator.py) | Geração dos quatro sensores, envio HTTP e fila de reenvio |
| [app/main.py](../app/main.py) | Recepção, consultas, resumo, exportação e disponibilização da interface |
| [app/models.py](../app/models.py) | Contrato JSON, tipos, faixas de valores e timestamps |
| [app/database.py](../app/database.py) | Conexões, tabelas e índices do SQLite |
| [web/dashboard.js](../web/dashboard.js) | Consultas REST, filtros, gráfico e inspeção das leituras |
| [run.py](../run.py) | Inicialização da API e do simulador em processos separados |

## Geração e envio das leituras

O simulador representa temperatura (`T010`), umidade (`H010`), luminosidade (`L010`) e movimento (`M010`). Temperatura, umidade e luminosidade variam com oscilações e ruído; movimento assume 0 para ausência ou 1 para detecção.

Cada ciclo gera quatro mensagens com `sensorId`, `type`, `value` e `timestamp`. O timestamp corresponde ao instante de geração, em UTC e formato ISO 8601. O intervalo padrão entre ciclos é de dois segundos, podendo aumentar quando a comunicação demora.

Cada mensagem é enviada como JSON por `POST` para `http://localhost:8080/api/sensor/data`. Antes do envio, ela é salva em uma fila local, no arquivo `data/outbox.db`. A mensagem só sai dessa fila depois da confirmação HTTP. Se houver falha temporária, o simulador preserva os dados e tenta novamente com espera crescente, limitada a 30 segundos. Rejeições permanentes são guardadas na tabela `rejected` para inspeção.

## Recepção e persistência

A API valida os campos, o tipo do sensor, os valores numéricos e o fuso do timestamp. Dados inválidos retornam HTTP 422. Os instantes aceitos são normalizados para UTC.

O banco principal, `data/iot.db`, possui duas tabelas: `sensors`, que associa o identificador ao tipo, e `readings`, que armazena o identificador da leitura, o sensor, o valor e o timestamp. Assim, um sensor pode possuir várias medições ao longo do tempo.

O par sensor e timestamp é único. Uma nova leitura retorna HTTP 201; o reenvio da mesma leitura retorna 200 sem criar duplicata. Um valor diferente para o mesmo sensor e instante, ou a tentativa de mudar o tipo de um sensor já cadastrado, retorna 409. Essa regra permite recuperar falhas de comunicação sem multiplicar registros já gravados.

## Consulta e visualização

O dashboard consulta a API a cada dois segundos. Exibe a última leitura de cada tipo, um gráfico temporal por sensor e um histórico paginado. Oferece filtros por tipo, identificador e período, exportação CSV e um painel lateral com os detalhes de cada registro.

A interface informa separadamente a conexão com a API e a atualização das leituras. Uma coleta com mais de 15 segundos é sinalizada como atrasada. Pausar a atualização do painel interrompe apenas suas consultas automáticas; o simulador continua enviando dados. Filtros e preferências são preservados no navegador.

## Funcionamento integrado

O fluxo completo é: **simulador gera uma leitura → envia JSON por HTTP → API valida → SQLite armazena → dashboard consulta a API → interface apresenta os dados**.

O simulador não acessa o banco da API diretamente, e o navegador também não lê o arquivo SQLite. Essa separação permite executar e interromper os componentes de forma independente. Embora a demonstração use uma máquina, há processos separados com comunicação pela rede. O banco permanece centralizado, sem replicação.

## Execução e verificação

A execução local pode ser iniciada com `python run.py`, após instalar `requirements.txt`. Para demonstrar falhas entre os componentes, usamos a API e o simulador em terminais separados, conforme o [roteiro da dupla](ROTEIRO_APRESENTACAO.md).

Também preparamos Dockerfile e Compose com containers separados e volumes persistentes. A configuração do Compose foi validada; a execução dos containers não foi verificada no ambiente de desenvolvimento porque o mecanismo do Docker Desktop estava parado.

Foram aprovados 39 testes automatizados da API e do simulador. A interface também foi verificada no navegador, incluindo filtros, inspeção, exportação, adaptação a telas pequenas e recuperação de conexão. O resultado atende ao fluxo de geração, recepção, persistência e visualização solicitado na atividade.
