# Decisões de arquitetura

## Separação dos componentes

O simulador não importa módulos da API e não acessa o banco de leituras. Seu único contrato com o servidor é HTTP/JSON. A aplicação web também consulta exclusivamente os endpoints públicos. Servir o HTML pelo mesmo servidor evita configuração CORS e mantém a execução local simples, sem eliminar a separação entre cliente e API.

O `run.py` é apenas um lançador de processos. A API não gera leituras dentro de uma tarefa interna. O Compose conserva essa separação em dois containers, que se comunicam pela rede interna.

## Persistência e consistência

SQLite atende à exigência do enunciado. O tipo é associado ao sensor; as leituras referenciam essa identidade. Chaves estrangeiras, índices e a restrição `UNIQUE(sensor_id,timestamp)` protegem o histórico. A API normaliza todos os instantes para UTC antes de armazená-los. Leituras atrasadas entram no histórico pelo instante da coleta, sem sobrescrever a última leitura mais recente.

Cada POST usa uma transação `BEGIN IMMEDIATE` para tornar atômicas a verificação do sensor, a detecção de duplicata e a inserção. Consultas de histórico/resumo usam uma transação de leitura para obter um snapshot consistente entre as consultas que compõem cada resposta. Cada requisição abre sua própria conexão, sem compartilhar conexões SQLite entre threads. WAL permite consultas durante escrita; o timeout é de dez segundos.

## Falhas e reenvios

A fila do simulador é outro arquivo SQLite, independente do banco da API. A geração é persistida antes da tentativa HTTP, e a remoção só acontece após confirmação. Se o processo cair após a API confirmar e antes de remover da fila, o reenvio recebe 200 e mantém uma única leitura no servidor.

Falhas temporárias provocam espera crescente (2, 4, 8, 16 e até 30 segundos) antes da próxima tentativa. Cada tentativa HTTP pode levar até três segundos; a geração e a entrega compartilham o mesmo laço, portanto a rede pode alongar o intervalo real. Os dados continuam sendo gerados entre tentativas. Após reiniciar o simulador, a fila é recuperada; seu tamanho não tem retenção automática, então indisponibilidade prolongada demanda espaço em disco.

Erros permanentes de contrato são removidos da fila ativa e preservados na tabela `rejected`, com o motivo. Reenviar a mesma identidade com valor diferente é um conflito, não uma atualização. O projeto não implementa uma API de alteração/remoção porque o domínio da atividade é um histórico de medições.

## Visualização

O dashboard faz polling a cada dois segundos, evita ciclos automáticos simultâneos e conserva a última visualização se a comunicação falhar. Indica a idade da leitura separadamente da conexão com a API: uma API disponível não prova que o simulador está enviando dados novos. O gráfico usa o timestamp real no eixo horizontal e degraus para movimento binário. Sensores do mesmo tipo podem ser escolhidos individualmente; os cards mostram o mais recente de cada tipo.

Os filtros de tipo e identificador aplicam-se ao histórico e ao CSV. O período também é compartilhado com o gráfico; cards mostram as últimas leituras de todo o ambiente. O gráfico mantém a seleção explícita do sensor, com um inspetor contextual e atalho para seu histórico. Tipo, sensor, filtros e densidade são preservados no armazenamento local do navegador. O CSV recebe um limite explícito de 50.000 registros por consulta. O frontend não usa CDN, fontes externas ou bibliotecas de gráficos; slides também são autônomos.

A inspeção de um registro abre um painel lateral com valor, identidade, horário e mensagem JSON. O registro continua visível no histórico, preservando os filtros. Enquanto há foco de teclado na tabela ou um detalhe aberto, a aplicação adia a substituição das linhas para não remover o objeto inspecionado. Cards e gráfico continuam atualizando. O retorno pelo Escape ou botão de fechamento usa o comportamento de foco do diálogo nativo.

## Limites da solução

É uma solução de laboratório em máquina local: uma instância da API, um escritor principal e armazenamento centralizado. Não representa um cluster replicado nem implementa autenticação, descoberta dinâmica, consenso ou tolerância à perda do disco. A fila cobre falhas de comunicação e reinícios, não a falha física dos arquivos. Os valores são simulações e não medições de hardware.
