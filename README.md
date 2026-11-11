# Mods da Markestrat

Mods do Claude usados nos projetos da Markestrat. Repositório privado: só quem foi convidado consegue instalar.

## Mods

| Mod | O que faz |
|---|---|
| [quadro-mensagens](plugins/quadro-mensagens/README.md) | Painel, ao lado do chat, com as demandas e pendências trocadas entre as wikis de consultores do mesmo projeto, com detalhes e sugestão de resposta gerados pela IA. Somente leitura |

## Instalar

Antes, a pessoa precisa ter acesso a este repositório no GitHub e o GitHub configurado no computador (`gh auth login` e depois `gh auth setup-git`).

No Claude Desktop: clique no **+** ao lado da caixa de mensagem → **Plugins** → **Add marketplace** com `LuccaA4/markestrat-mods` → **Add plugin** → `quadro-mensagens`.

Num terminal com o Claude:

```
/plugin install quadro-mensagens --marketplace LuccaA4/markestrat-mods
```

De um terminal comum:

```
claude plugin install quadro-mensagens --marketplace LuccaA4/markestrat-mods
```
