# Validação da entrega

Verificações realizadas em 24/11/2026, no ambiente Windows com Python 3.13 e Chrome em modo headless.

## API e simulador

`python -m pytest -q`: **39 testes passaram**. Cobertura dos contratos de entrada, tipos e faixas, datas com fuso, entradas não finitas, banco persistido após reinício, reenvios e conflitos, concorrência, consultas e exportação, fila após falha/reinício/recuperação e rejeições permanentes.

Também foi executado o simulador real contra o servidor Uvicorn por HTTP. As mensagens foram aceitas e recuperadas pelo dashboard. Os bancos dos testes automatizados e da revisão visual são separados do banco padrão da aplicação.

## Dashboard e apresentação

Verificação com Chrome/Playwright em 1440 px e 390 px: conexão com a API, renderização de dados reais recebidos pelo servidor de teste, seleção de movimento e atualização do gráfico, filtro de umidade, avanço e retorno de página, pausa de atualização e download de CSV.

Os cinco slides foram renderizados e inspecionados em desktop e celular. Foram verificados setas, limites no primeiro/último slide, Home/End, indicador de progresso e encaixe do conteúdo. Nenhum erro de JavaScript foi observado nessas verificações.

## Docker

`docker compose config --quiet`: passou. O Docker Desktop estava sem mecanismo Linux ativo, então **a imagem não foi construída e os containers não foram executados**. O funcionamento da aplicação foi validado nativamente; a execução em containers permanece uma verificação a realizar após iniciar o Docker Desktop.

## Entrega acadêmica

A gravação do vídeo exigido pelo enunciado não foi realizada: depende da participação dos dois integrantes. Os slides e a aplicação estão preparados para essa demonstração.

## Redesign da interface em 25/11/2026

Nova revisão em Chrome após aplicar os conceitos do relatório UniFi: foco durante polling, seleção e filtros preservados após recarga, densidade da tabela, inspeção lateral e retorno pelo Escape, CSV, pausa e layouts em 1440/1024/768/390/320 pixels. Também foram verificados perda de comunicação com preservação dos últimos dados, recuperação, API conectada com coleta atrasada e distinção entre banco vazio e filtro sem resultados. Esses cenários passaram, sem erros JavaScript. As falhas foram simuladas apenas no navegador de teste, sem mudar o banco da demonstração.

O dashboard atualizado foi aberto no domínio público do Cloudflare Tunnel e confirmou conexão com a API. Cores e contraste da apresentação foram alinhados ao console, mantendo os cinco slides e seu conteúdo.
