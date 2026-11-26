# Interface do console Pulso

Redesign baseado nos conceitos do relatório fornecido “Relatorio_UniFi_UX_UI_Skills.pdf”, pesquisa de 24/11/2026. O documento foi tratado como referência de design. Os briefings e as skills citados nele não foram interpretados como instruções de instalação, delegação ou execução.

## Aplicação dos conceitos

| Referência do relatório | Decisão no Pulso |
| --- | --- |
| Hierarquia e escopo, p. 6 | Navegação estável; contexto “Laboratório IoT”; seções de visão geral e histórico |
| Gramática visual e tokens, pp. 9–10 | Superfícies brancas sobre fundo neutro, bordas discretas, azul para ação/seleção, espaçamento e ícones consistentes |
| Detalhe contextual, p. 11 | Inspeção lateral da leitura, com valor, identidade e mensagem; lista e filtros preservados |
| Diagnóstico e atualização, p. 12 | API conectada separada do estado da coleta; timestamp e idade visíveis; atraso após 15 segundos |
| Adaptação móvel, p. 15 | Navegação compacta com rótulos acessíveis; tabela prioriza sensor, valor, horário e inspeção; demais campos no detalhe |
| Continuidade e confiança, pp. 19–21 | Preferências persistentes, foco preservado durante polling, estados distintos de vazio, filtro sem resultado, pausa e offline |

O estilo é uma identidade própria do Pulso. Os tokens do relatório são uma proposta independente, não uma especificação oficial do UniFi. O projeto não replica logotipos, navegação ou funcionalidades da Ubiquiti.

## Sistema visual

- Fundo `#F5F7FA`, superfície `#FFFFFF`, texto `#162235` e texto secundário `#647187`.
- Azul `#006EFF` para seleção, foco, ícones e série temporal. Ações com texto branco usam `#0065EB`, mais escuro, para contraste.
- Sucesso `#18864B` e atenção `#9C5906`, sempre acompanhados de texto.
- Tipografia do sistema; conteúdo de 13–14 px, metadados de 11–12 px e título de 28 px no desktop.
- Controles com foco visível, tabela compacta ou confortável, ícones nativos SVG e gráfico Canvas.

A apresentação conserva os cinco slides e a navegação por setas, com a paleta clara e azul alinhada ao console. O link final usa a origem atual quando servida por HTTP, funcionando também no túnel público.

## Escopo e comportamento

As últimas leituras representam todos os sensores. O gráfico tem um sensor selecionado, explicitado no título/identificador. O período vale tanto para o gráfico quanto para o histórico; os filtros de tipo e identificador restringem a tabela e o CSV. O atalho “Ver histórico deste sensor” aplica a identidade do sensor sem sair da tela.

As preferências de tipo selecionado, sensor, filtros e densidade são guardadas em `localStorage` por origem. Ao trocar o domínio de um túnel, o navegador inicia preferências separadas. Falha ou bloqueio desse armazenamento não impede o uso do painel.

Pausar o painel não interrompe o simulador. O botão informa esse escopo e troca de rótulo/ícone/estado. A API pode estar disponível enquanto os sensores não enviam dados: por isso conexão e idade da leitura têm estados separados. Uma falha de consulta preserva os últimos valores e os marca como não confirmados.

## Verificação

A revisão automatizada em Chrome cobre foco durante polling, seleção e filtros após recarga, detalhe e retorno por teclado, CSV, pausa, layouts de 1440/1024/768/390/320 px, perda/recuperação de conexão, coleta atrasada e vazio com e sem filtros. Os cenários de falha usam interceptação apenas no navegador de teste; o banco e o simulador públicos não são alterados.

Teste opcional de UI: com o pacote Node `playwright`, Chrome instalado e o projeto rodando, execute `node scripts/check-ui.cjs`. `BASE_URL` muda o endereço do servidor, `BROWSER_EXECUTABLE` permite escolher o navegador e `PLAYWRIGHT_MODULE` permite usar um módulo Playwright já disponível no ambiente. As capturas de revisão são gravadas em `tmp/unifi/`.
