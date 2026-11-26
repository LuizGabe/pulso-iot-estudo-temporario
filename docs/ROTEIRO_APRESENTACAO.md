# Roteiro de apresentação de Pedro e Luiz

**Ordem:** Pedro apresenta seu bloco inteiro; em seguida, Luiz apresenta seu bloco inteiro e encerra. Há uma única passagem de fala. A divisão abaixo organiza a apresentação, sem atribuir a cada integrante a autoria exclusiva de partes do código. Não há duração obrigatória: avancem quando a explicação e a evidência na tela estiverem claras.

## Preparação antes da gravação

Usem a execução local para o vídeo. O túnel público é uma prévia temporária e não substitui a demonstração dos processos e do banco. Se já houver uma instância usando a porta 8080, encerrem essa instância antes de iniciar a gravação.

Instalem as dependências uma vez, na raiz do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Deixem preparados três terminais na pasta do projeto: **API**, **Simulador** e **Consultas**. Durante a gravação, usem os dois processos individualmente, sem iniciar `run.py` ao mesmo tempo. Assim é possível interromper somente o simulador ou somente a API.

Terminal API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host localhost --port 8080
```

Terminal Simulador, iniciar apenas quando Pedro chegar à demonstração do envio:

```powershell
.\.venv\Scripts\python.exe simulator.py --interval 2
```

No navegador, preparem a apresentação em `http://localhost:8080/apresentacao`, o dashboard em `http://localhost:8080/` e o resumo em `http://localhost:8080/api/sensor/summary`. No editor, deixem acessíveis `simulator.py`, `app/models.py`, `app/main.py`, `app/database.py` e `web/dashboard.js`.

Se o banco já tiver histórico, apresentem esses registros como dados de execuções anteriores. A comprovação de novos dados deve usar timestamps recentes e aumento da contagem, sem afirmar que a execução começou do zero.

## Bloco de Pedro

### Abertura e proposta

**Na tela:** slides 1 e 2.

**Fala sugerida:**

> Nós somos Pedro Butzke e Luiz Gabriel. Nosso trabalho é o Pulso IoT, desenvolvido para a disciplina de Sistemas Distribuídos. Implementamos um simulador de sensores, uma API REST e um dashboard. A proposta é acompanhar o caminho completo de uma leitura: da geração até o armazenamento e a visualização.
>
> Temos quatro tipos de sensores: temperatura, umidade, luminosidade e movimento. Os dados são simulados pelo nosso programa; não dependemos de sensores físicos para demonstrar a integração.

### Arquitetura e estrutura do projeto

**Na tela:** slides 3 e 4; depois, árvore de arquivos no editor.

**Fala sugerida:**

> O simulador roda em um processo separado e envia mensagens JSON por HTTP. A API recebe essas mensagens na porta 8080, valida os dados e os grava no SQLite. O dashboard faz consultas HTTP à API para exibir o que está armazenado.
>
> Escolhemos Python para o simulador e para a API. Usamos FastAPI nas rotas e Pydantic na validação. A interface usa HTML, CSS e JavaScript, com o gráfico desenhado em Canvas.
>
> No projeto, o simulador está em simulator.py. A pasta app contém as rotas, os modelos de validação e o acesso ao banco. A pasta web contém a interface e os slides. Também temos testes e uma configuração de Docker para separar API e simulador em containers.
>
> Mesmo rodando nesta máquina, os componentes são processos independentes que se comunicam por HTTP. O simulador não chama funções internas da API nem grava diretamente no banco principal.

Não afirmem que Docker foi usado na demonstração se estiverem executando Python diretamente. A configuração existe, mas o vídeo pode demonstrar toda a solução nativamente.

### Código do simulador

**Na tela:** `simulator.py`, nas definições `SENSORS`, `generate()`, `Outbox.deliver()` e no laço de `main()`.

**Fala sugerida:**

> Aqui definimos os identificadores fixos dos quatro sensores: T010, H010, L010 e M010. A função generate produz os valores. Temperatura, umidade e luminosidade usam oscilações com pequenas variações aleatórias. Movimento é binário: zero significa ausência e um significa detecção.
>
> Cada leitura tem sensorId, type, value e timestamp. O timestamp é obtido no momento da geração e enviado em UTC, no formato ISO 8601. O intervalo padrão é de dois segundos entre ciclos, e cada ciclo gera uma leitura de cada sensor.
>
> Antes de enviar, salvamos as mensagens em uma fila SQLite local. O método deliver monta a requisição HTTP POST com Content-Type application/json. A mensagem só é removida da fila quando recebemos uma confirmação 200 ou 201. Se a comunicação falhar, ela continua salva para uma nova tentativa.

**Ação:** apontar no código o endereço padrão `http://localhost:8080/api/sensor/data` e o tratamento de falhas. Não é necessário ler o arquivo inteiro.

### Contrato e recepção pela API

**Na tela:** `app/models.py`, classe `Reading`; depois, `app/main.py`, função `receive()`.

**Fala sugerida:**

> A classe Reading define o contrato esperado pela API. Ela limita os tipos aceitos, exige um valor numérico finito e um timestamp com fuso horário. Também valida as faixas de cada grandeza e impede movimento diferente de zero ou um.
>
> A rota POST /api/sensor/data recebe uma leitura já validada. Se o JSON estiver inválido, a API responde 422. Para uma nova leitura válida, a resposta é 201. A API também reconhece reenvios: se o mesmo sensor, instante e valor já estiverem gravados, retorna 200 sem duplicar. Se houver um valor diferente para a mesma identidade, responde 409.
>
> Isso é útil quando o servidor grava a leitura, mas a resposta se perde. O simulador pode reenviar a mensagem, e o banco mantém um único registro.

### Geração e envio acontecendo

**Na tela:** terminal API já iniciado; depois, terminal Simulador.

**Ação:** iniciar o simulador com o comando da preparação e acompanhar pelo menos dois ciclos.

**Fala sugerida:**

> Agora a API está escutando na porta 8080. Vou iniciar o simulador. Aqui aparecem os identificadores, os valores e a confirmação de envio. No terminal da API, vemos as requisições POST e suas respostas. Em cada ciclo, os quatro sensores enviam suas leituras automaticamente.
>
> Esses logs mostram a comunicação real entre os processos. Agora o Luiz vai acompanhar o que acontece com essas leituras depois da recepção, mostrando o banco e o dashboard integrados.

**Passagem única:** Pedro encerra seu bloco. Luiz assume e permanece até o final.

## Bloco de Luiz

### Estrutura e funcionamento do SQLite

**Na tela:** `app/database.py`, dentro de `initialize()`; em seguida, trecho da transação em `receive()`, no `app/main.py`.

**Fala sugerida:**

> Depois da recepção, os dados são persistidos no arquivo data/iot.db. Temos a tabela sensors, que associa o identificador ao tipo, e a tabela readings, que guarda cada medição com seu ID, sensor, valor e timestamp.
>
> Um sensor pode ter várias leituras. A chave estrangeira mantém a relação entre as tabelas, e a restrição UNIQUE em sensor e timestamp impede duplicatas. Usamos transações para que a verificação e a inserção aconteçam juntas, além de consultas parametrizadas e índices para buscar por sensor e tempo.
>
> Existe outro arquivo, data/outbox.db, mas ele tem uma função diferente: é a fila de envio do simulador. O histórico consultado pela aplicação está no iot.db.

**Ação no terminal Consultas:** executar a consulta abaixo enquanto o simulador continua enviando.

```powershell
.\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('data/iot.db'); print(c.execute('SELECT sensor_id, COUNT(*) FROM readings GROUP BY sensor_id').fetchall()); print(c.execute('SELECT sensor_id, value, timestamp FROM readings ORDER BY id DESC LIMIT 4').fetchall()); c.close()"
```

**Fala sugerida:**

> Esta consulta lê o próprio SQLite. Aqui estão a quantidade de registros de cada sensor e as últimas leituras inseridas. Os valores não estão apenas no terminal do simulador: já foram armazenados no banco.

### Endpoints de consulta e código do dashboard

**Na tela:** rotas GET de `app/main.py`; depois, `web/dashboard.js`, nas funções `refresh()`, `loadChart()` e `renderTable()`.

**Fala sugerida:**

> A rota GET /api/sensor/data disponibiliza o histórico com paginação e filtros. A rota summary retorna contagem e últimas leituras, e a rota export gera o CSV.
>
> No navegador, a função refresh consulta a API a cada dois segundos. Os dados retornados alimentam os cards e o histórico. A função loadChart busca as amostras do sensor selecionado, e renderTable monta a listagem. O frontend usa HTTP; ele não acessa o arquivo SQLite diretamente.
>
> Mantivemos a leitura atual separada do histórico filtrado. O gráfico permite selecionar um sensor, e o período também acompanha o filtro do histórico. A interface distingue uma API conectada de um sensor com coleta atrasada.

### Demonstração completa no dashboard

**Na tela:** slide 5 e, em seguida, botão para abrir o dashboard.

**Ações e falas:**

1. **Mostrar os quatro cards e esperar uma atualização.**

   > Estas são as últimas leituras de temperatura, umidade, luminosidade e movimento. Os valores e horários mudam conforme o simulador envia novas mensagens.

2. **Selecionar temperatura ou umidade e apontar o gráfico e o inspetor do sensor.**

   > Ao selecionar um tipo, conseguimos acompanhar sua evolução e conferir qual sensor está sendo consultado. O gráfico usa os timestamps das leituras e informa a unidade e o período.

3. **Filtrar o histórico por um sensor e pelos últimos cinco minutos.**

   > Aqui restringimos a consulta aos dados que queremos investigar. O histórico mostra os registros persistidos, com valor e horário. O período selecionado também é aplicado ao gráfico.

4. **Abrir o detalhe de uma leitura pela seta da linha.**

   > Este painel mantém a lista ao fundo e mostra a identidade da leitura, seu valor e a mensagem JSON. Os filtros continuam preservados quando fechamos o detalhe.

5. **Exportar CSV e mostrar o arquivo baixado, se isso ajudar na gravação.**

   > A exportação respeita os filtros usados no histórico. Assim podemos retirar uma amostra dos dados armazenados para análise.

6. **Abrir o resumo da API no navegador ou pelo terminal.**

   ```powershell
   Invoke-RestMethod 'http://localhost:8080/api/sensor/summary' | ConvertTo-Json -Depth 5
   ```

   > Aqui vemos a mesma origem de dados em JSON. O caminho fica completo: o simulador gerou e enviou, a API recebeu, o banco armazenou e o navegador consultou para apresentar os resultados.

### Persistência após interromper o simulador

**Na tela:** terminal Simulador e dashboard.

**Ações:** encerrar apenas o simulador com Ctrl+C; manter a API executando; recarregar o dashboard e consultar novamente o SQLite.

**Fala sugerida:**

> Vou parar apenas o simulador. As leituras anteriores continuam no dashboard e no SQLite, mesmo depois de recarregar a página. Isso demonstra a persistência: os dados não dependem da memória do navegador ou de o gerador continuar aberto.
>
> Se aguardarmos mais de 15 segundos sem novas leituras, o painel sinaliza atraso na coleta. A API continua conectada, porque parar a geração é diferente de parar o servidor.

Reiniciar o simulador após essa demonstração permite mostrar que as novas leituras se somam ao histórico existente.

### Falha de comunicação e recuperação

Esta etapa demonstra um diferencial além do fluxo principal. Façam o teste antes da gravação e deixem o simulador executando durante a interrupção.

**Ações:**

1. No terminal API, pressionar Ctrl+C, mantendo o simulador aberto.
2. Acompanhar a mensagem de falha no simulador e o estado sem conexão no dashboard.
3. Esperar alguns ciclos para acumular leituras.
4. No terminal Consultas, conferir a fila:

   ```powershell
   .\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('data/outbox.db'); print('Leituras pendentes:', c.execute('SELECT COUNT(*) FROM pending').fetchone()[0]); c.close()"
   ```

5. Reiniciar a API no mesmo terminal com o comando da preparação.
6. Aguardar a próxima tentativa do simulador. A espera cresce em falhas sucessivas e pode chegar a 30 segundos; não prometam recuperação instantânea.
7. Mostrar os envios confirmados, a recuperação do dashboard e a redução da fila. Com geração contínua, a contagem pode variar e não precisa permanecer em zero.

**Fala sugerida:**

> Agora interrompi a API e mantive o simulador funcionando. As mensagens que não conseguem ser entregues ficam na fila persistente. O dashboard também identifica a falha e mantém os últimos dados como não confirmados.
>
> Ao reiniciar o servidor, o simulador tenta novamente e entrega as leituras pendentes. A API reconhece reenvios para não duplicar uma leitura que já tenha sido gravada. Esse comportamento trata falhas temporárias de comunicação e deixa os componentes menos dependentes de estarem disponíveis ao mesmo tempo.

### Encerramento

**Na tela:** dashboard recuperado, com dados recentes.

**Fala sugerida:**

> Com isso demonstramos a estrutura do código e o funcionamento integrado do sistema. Temos geração periódica dos quatro sensores, envio HTTP em JSON, validação pela API, persistência SQLite e visualização pelo dashboard.
>
> Também mostramos consultas, filtros e o tratamento de falhas. A solução mantém os componentes separados e usa HTTP para integrar as etapas, atendendo à proposta de Sistemas Distribuídos.

## Revisão conjunta antes de gravar

Confiram se o vídeo mostra o código de cada componente, os quatro sensores enviando leituras, os POSTs recebidos pela API, uma consulta direta ao SQLite e o dashboard consumindo a API. O vídeo deve mostrar os dois integrantes apresentando; os slides servem como introdução e transição para o sistema.

Não confundam “pausar atualização” com parar sensores; não apresentem a fila outbox como banco principal; não chamem uma execução local de cluster replicado; e não atribuam a Docker ou ao túnel o funcionamento do sistema se o teste estiver usando Python diretamente.

## Perguntas para estudar

| Pergunta | Resposta esperada |
| --- | --- |
| Por que podemos falar em componentes distribuídos na mesma máquina? | São processos independentes, integrados por HTTP. Podem ser separados em outros hosts com configuração de endereços, mas a demonstração usa uma máquina e um banco centralizado. |
| Por que usamos POST e GET? | POST recebe novas medições; GET consulta representações dos dados sem inserir leituras. |
| Quem acessa o SQLite principal? | A API. O simulador acessa somente sua própria fila, e o navegador consulta a API. |
| Por que duas tabelas no banco principal? | Para guardar a identidade e o tipo uma vez em sensors e associar várias medições em readings. |
| O que identifica um reenvio? | Mesmo sensor e timestamp; valor igual confirma a duplicata sem inserir, valor diferente gera conflito. |
| O que acontece se a resposta HTTP se perder após a gravação? | A mensagem pode ser reenviada pela fila; a API retorna confirmação sem criar outro registro. |
| O timestamp é de geração ou de consulta? | É de geração da leitura. A API normaliza para UTC, e o navegador apresenta o horário local. |
| API conectada garante coleta atualizada? | Não. O servidor pode responder sem receber novas mensagens do simulador. |
| O banco é replicado? | Não. Usamos SQLite junto da API, com persistência local. |
| Como demonstramos que a solução funciona de ponta a ponta? | Correlacionando geração e logs do POST com registros SQLite, retorno GET e atualização do dashboard. |
