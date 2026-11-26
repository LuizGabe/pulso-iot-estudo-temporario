# Mensagem para Pedro

Pedro, deixei o código e o material do nosso trabalho aqui:

https://github.com/LuizGabe/pulso-iot-estudo-temporario

O projeto é o Pulso IoT: um simulador em Python gera temperatura, umidade, luminosidade e movimento, manda as leituras por HTTP para uma API FastAPI, a API salva em SQLite e o dashboard consulta esses dados.

Para estudar, começa pelo relatório simples em `docs/RELATORIO_IMPLEMENTACAO.md` e depois lê `docs/ROTEIRO_APRESENTACAO.md`. O roteiro já tem as falas sugeridas e o que mostrar na tela.

Vamos dividir em dois blocos completos, sem ficar alternando: você apresenta primeiro a proposta, a arquitetura, o simulador e como a API recebe e valida o JSON. Mostra o código e inicia os sensores para aparecerem os envios nos logs. Depois eu assumo com o banco, as consultas, o código do dashboard e a demonstração integrada, incluindo persistência e recuperação de falha.

Na sua parte, olha principalmente `simulator.py`, `app/models.py` e a função `receive()` de `app/main.py`. Tenta entender o caminho da leitura, a fila de reenvio e os retornos 201, 200, 409 e 422. Não precisa decorar nem ler o código inteiro na gravação: o importante é conseguir explicar o que cada parte faz e apontar isso funcionando.

O README tem os comandos para rodar. Antes de gravar, vamos ensaiar a sequência juntos para conferir os terminais e a passagem de fala. O professor quer ver os dois explicando o código e o simulador, a API, o SQLite e o dashboard funcionando integrados.
