# Correspondência com o enunciado

Fonte: “Avaliação 04 - API REST IoT.pdf”, Avaliação IV, Sistemas Distribuídos, 20/11/2026. As instruções do documento foram usadas como requisitos da atividade. A personalização e o formato HTML da apresentação seguem os pedidos de Luiz Gabriel.

| Requisito | Implementação / evidência |
| --- | --- |
| Simulador próprio, com código completo | `simulator.py`, sem simulador pronto |
| Temperatura, umidade, luminosidade e movimento | T010, H010, L010 e M010; testes validam 200 ciclos |
| Geração periódica e identificadores consistentes | `generate()` e laço do simulador; intervalo configurável |
| JSON com sensorId, type, value, timestamp | Contrato `Reading` e mensagens geradas pelo simulador |
| Timestamp da leitura em ISO 8601 | Instante real de geração em UTC com sufixo Z |
| POST application/json para localhost:8080/api/sensor/data | Destino padrão do simulador e rota exata da API |
| Iniciar, encerrar e registrar sucesso/falhas | CLI, Ctrl+C, sinais e logs por envio |
| API recebe e processa o JSON | FastAPI e validação Pydantic |
| Persistir em SQLite | `app/database.py`, `data/iot.db` e volume Docker |
| Múltiplas leituras com sensorId, value, timestamp | Tabela `readings`; tipo armazenado em `sensors` |
| Dashboard consome API via HTTP REST | `fetch()` em `web/dashboard.js` |
| Listagem de leituras | Histórico paginado com tipo, valor e data |
| Gráficos ou visualizações resumidas | Cards de última leitura e gráfico temporal por sensor |
| Organização e qualidade geral da interface | Módulos separados, interface responsiva, estados de vazio/falha |
| Explicação e demonstração integrada | Slides introdutórios, README e código organizado; apresentação prática pela dupla |
| Vídeo explicativo com integrantes | **Pendente de gravação pela dupla**, conforme exigência do PDF |

Pesos do enunciado: simulador/API/persistência **15 pontos**; dashboard e qualidade do código **15 pontos**; explicação e demonstração **20 pontos**. A tabela documenta a cobertura, sem presumir a nota atribuída pelo professor.

Extras do projeto: fila persistente, reenvios idempotentes, validação de conflitos, filtros, exportação CSV, configuração Docker e testes automatizados. O enunciado não obriga esses extras.
