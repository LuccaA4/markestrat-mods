# Quadro de mensagens da equipe

Mod do Claude que abre, ao lado do chat, um painel **somente leitura** com o que as wikis de consultores do mesmo projeto endereçam umas às outras.

## O que ele lê

Na pasta que reúne as wikis (as pastas `wiki-<Nome>`), o `wiki/estado-atual.md` de cada uma:

- **Demandas:** cada título `### <Nome> — <assunto> (atribuído em AAAA-MM-DD)` da seção "Demandas da equipe";
- **Pendências:** cada linha das tabelas "Pendências abertas" e "Pendências resolvidas" que diga "Responsável: <Nome>", "Combinar com <Nome>", "Validar com <Nome>", "Levar a <Nome>", "Perguntar a <Nome>" ou "Pedir a <Nome>".

Cada mensagem aparece reescrita pela IA por extenso, sem os códigos internos da wiki (como P-018 ou D-003): os códigos são traduzidos pelos títulos das páginas da wiki de quem enviou. O resumo fica guardado e só é refeito quando o texto da pendência muda.

O painel separa o que é **para você** do que foi **enviado por você**, com um link para a página de origem. Ele relê as wikis a cada 5 minutos e avisa quando chega algo novo. Nunca grava nada.

## Ver detalhes

Cada mensagem recebida tem o botão **Ver detalhes**. A IA (modelo Sonnet, pela conta da sessão) lê a página de origem na wiki de quem enviou e a sua wiki, e mostra:

- **Por que a pendência surgiu**, segundo a wiki de quem enviou;
- **Detalhamento**: o que está sendo pedido, as opções e o que a resposta destrava;
- **Sugestão de resposta**, só quando a sua wiki tem análises, decisões ou reuniões que de fato sustentem uma resposta. Sem apoio, a seção não aparece.

O texto é gerado na hora, fica só na sessão e não é gravado em nenhuma wiki. "Gerar de novo" refaz a leitura.

## Uso

Abra o Claude dentro da pasta da sua wiki: o painel abre sozinho. O comando `/mensagens` reabre o painel e atualiza a leitura.
