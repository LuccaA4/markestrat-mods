import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Detalhe, Leitura, Mensagem } from '../types'
import { gerarDetalhe } from './detalhes'
import { acharRaiz, donoDaPasta, lerEstadoAtual } from './ler-wikis'

const PAINEL = 'quadro-mensagens'
const TITULO = 'Mensagens da equipe'
const INTERVALO_MS = 5 * 60 * 1000

// Mude a etiqueta quando os campos mudarem: o valor antigo guardado é descartado.
const mensagens = atom({ plugin: 'quadro-mensagens', key: 'mensagens' } as const, [], {
  shape: 'mensagens-2',
})
const leitura = atom({ plugin: 'quadro-mensagens', key: 'leitura' } as const, null, {
  shape: 'leitura-1',
})
const selecionada = atom({ plugin: 'quadro-mensagens', key: 'selecionada' } as const, null)
const detalhes = atom({ plugin: 'quadro-mensagens', key: 'detalhes' } as const, {}, {
  shape: 'detalhes-1',
})

const hora = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const urlArquivo = (caminho: string) =>
  `file:///${encodeURI(caminho.replace(/\\/g, '/').replace(/^\/+/, ''))}`

/** Lê todas as wikis da pasta do projeto. Nunca grava nada nelas. */
async function lerTudo($: EngineInterface, cwd: string, avisar: boolean) {
  const achou = acharRaiz(cwd)
  if (!achou) return
  const { raiz, leitor } = achou
  const erros: string[] = []
  const wikis: { dono: string; arquivo: string }[] = []
  try {
    for (const ent of await $.fs.list(raiz)) {
      const dono = ent.kind === 'dir' ? donoDaPasta(ent.name) : null
      if (dono) wikis.push({ dono, arquivo: `${raiz}/${ent.name}/wiki/estado-atual.md` })
    }
  } catch (err) {
    erros.push(`Não consegui listar ${raiz}: ${String(err)}`)
  }
  const nomes = wikis.map(w => w.dono)
  const todas: Mensagem[] = []
  for (const w of wikis) {
    try {
      const texto = await $.fs.read(w.arquivo)
      todas.push(...lerEstadoAtual(texto, w.dono, nomes.filter(n => n !== w.dono), w.arquivo))
    } catch {
      erros.push(`Sem estado-atual.md na wiki de ${w.dono}`)
    }
  }
  const antes = new Set((await read($, mensagens)).map(m => m.chave))
  const tinhaLeitura = (await read($, leitura)) !== null
  const novas = todas.filter(m => m.para === leitor && !antes.has(m.chave))
  await update($, mensagens, () => todas)
  await update($, leitura, () => ({ leitor, raiz, lidaEm: Date.now(), erros }))
  const abertas = todas.filter(m => m.para === leitor && m.situacao === 'aberta').length
  await $.ui.status(abertas ? `${abertas} mensagem(ns) da equipe para você` : undefined)
  if (avisar && tinhaLeitura && novas.length > 0) {
    await $.ui.toast(`${novas.length} mensagem(ns) nova(s) da equipe — /mensagens`)
  }
}

/** Pede à IA os detalhes de uma mensagem recebida e guarda o resultado na sessão. */
async function detalhar($: EngineInterface, chave: string) {
  const lida = await read($, leitura)
  const m = (await read($, mensagens)).find(x => x.chave === chave)
  if (!lida || !m) return
  await update($, detalhes, d => ({ ...d, [chave]: { estado: 'gerando' as const } }))
  let resultado: Detalhe
  try {
    resultado = await gerarDetalhe($, lida.raiz, lida.leitor, m)
  } catch (err) {
    resultado = { estado: 'erro', erro: `Falha ao gerar os detalhes: ${String(err)}` }
  }
  await update($, detalhes, d => ({ ...d, [chave]: resultado }))
}

export const register: Register = on => {
  let cwd = ''

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    const ran = await next(e)
    if (!acharRaiz(cwd)) return ran
    await $.command.register({
      name: 'mensagens',
      description: 'Abre o painel com as demandas e pendências trocadas entre as wikis do projeto',
    })
    await lerTudo($, cwd, false)
    void $.ui.open({ id: PAINEL, title: TITULO })
    try {
      $.clock.every(INTERVALO_MS, () => {
        void lerTudo($, cwd, true)
      })
    } catch {
      // Sem releitura automática: o botão Atualizar e /mensagens continuam valendo.
    }
    return ran
  })

  on('command.run', { command: 'mensagens' }, async $ => {
    await lerTudo($, cwd || (await $.session.cwd()), false)
    await $.ui.open({ id: PAINEL, title: TITULO })
    return { text: 'Painel de mensagens da equipe aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const { Box, Text, Button, Link, Markdown } = $.ui.resolve(e)
    const lida = await read($, leitura)
    const lista = await read($, mensagens)
    const escolhida = await read($, selecionada)

    if (!lida) {
      return (
        <Box flexDirection="column">
          <Text dimColor>
            Abra o Claude dentro da pasta de uma wiki (wiki-Nome) para ver as mensagens.
          </Text>
        </Box>
      )
    }

    const eu = lida.leitor
    const cabecalho = (m: Mensagem, outro: string) =>
      `${m.tipo}${m.id ? ` ${m.id}` : ''} · ${outro}${m.data ? ` · ${m.data}` : ''}${
        m.situacao === 'resolvida' ? ' · resolvida' : ''
      }`

    // ---- Tela de detalhes de uma mensagem recebida ----
    const m = escolhida ? lista.find(x => x.chave === escolhida) : undefined
    if (m) {
      const det = (await read($, detalhes))[m.chave]
      const voltar = () => {
        void update($, selecionada, () => null)
      }
      const gerar = () => {
        void detalhar($, m.chave)
      }
      return (
        <Box flexDirection="column">
          <Button key="voltar" onPress={voltar}>
            ← Voltar às mensagens
          </Button>
          <Box flexDirection="column" borderStyle="round" paddingX={1} marginY={1}>
            <Text bold>{cabecalho(m, `de ${m.de}`)}</Text>
            <Text>{m.completo}</Text>
            {m.origem !== '' && <Text dimColor>Origem: {m.origem}</Text>}
            {m.destrava !== '' && <Text dimColor>O que destrava: {m.destrava}</Text>}
            <Link href={urlArquivo(m.arquivo)} label={`estado-atual da wiki de ${m.de}`} />
          </Box>

          {(!det || det.estado === 'gerando') && (
            <Text dimColor>A IA está lendo a wiki de {m.de} e a sua para montar os detalhes…</Text>
          )}

          {det?.estado === 'erro' && (
            <Box flexDirection="column">
              <Text color="yellow">{det.erro ?? 'Não foi possível gerar os detalhes.'}</Text>
              <Button key="tentar" onPress={gerar}>
                Tentar de novo
              </Button>
            </Box>
          )}

          {det?.estado === 'pronto' && (
            <Box flexDirection="column">
              <Text bold>Por que a pendência surgiu</Text>
              <Markdown text={det.motivo ?? 'Não registrado.'} />
              <Text bold>Detalhamento</Text>
              <Markdown text={det.detalhamento ?? 'Não registrado.'} />
              {det.sugestao && (
                <Box flexDirection="column">
                  <Text bold>Sugestão de resposta, com base na sua wiki</Text>
                  <Markdown text={det.sugestao} />
                </Box>
              )}
              <Text dimColor>
                Texto gerado pela IA às {hora(det.geradoEm ?? Date.now())}, a partir das duas wikis.
                Nada foi gravado. Para registrar uma resposta, peça no chat.
              </Text>
              <Button key="regerar" onPress={gerar}>
                Gerar de novo
              </Button>
            </Box>
          )}
        </Box>
      )
    }

    // ---- Lista de mensagens ----
    const ordenar = (a: Mensagem, b: Mensagem) =>
      a.situacao === b.situacao ? b.data.localeCompare(a.data) : a.situacao === 'aberta' ? -1 : 1
    const recebidas = lista.filter(x => x.para === eu).sort(ordenar)
    const enviadas = lista.filter(x => x.de === eu).sort(ordenar)

    const cartao = (x: Mensagem, outro: string, comDetalhes: boolean) => (
      <Box
        key={`m-${x.chave}`}
        flexDirection="column"
        borderStyle="round"
        paddingX={1}
        marginBottom={1}
      >
        <Text bold={x.situacao === 'aberta'} dimColor={x.situacao === 'resolvida'}>
          {cabecalho(x, outro)}
        </Text>
        <Text dimColor={x.situacao === 'resolvida'}>{x.texto}</Text>
        <Link href={urlArquivo(x.arquivo)} label={`estado-atual da wiki de ${x.de}`} />
        {comDetalhes && (
          <Button
            key={`d-${x.chave}`}
            onPress={() => {
              void (async () => {
                await update($, selecionada, () => x.chave)
                const atual = (await read($, detalhes))[x.chave]
                if (!atual || atual.estado === 'erro') await detalhar($, x.chave)
              })()
            }}
          >
            Ver detalhes
          </Button>
        )}
      </Box>
    )

    const secao = (
      titulo: string,
      itens: Mensagem[],
      quem: (x: Mensagem) => string,
      comDetalhes: boolean,
    ) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>
          {titulo} ({itens.filter(x => x.situacao === 'aberta').length} abertas)
        </Text>
        {itens.length === 0 && <Text dimColor>Nada por aqui.</Text>}
        {itens.map(x => cartao(x, quem(x), comDetalhes))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>
          Você: {eu} · lido às {hora(lida.lidaEm)} · somente leitura
        </Text>
        <Button
          key="atualizar"
          onPress={() => {
            void lerTudo($, cwd, false)
          }}
        >
          Atualizar
        </Button>
        {lida.erros.map(err => (
          <Text color="yellow">{err}</Text>
        ))}
        {secao('Para você', recebidas, x => `de ${x.de}`, true)}
        {secao('Enviadas por você', enviadas, x => `para ${x.para}`, false)}
      </Box>
    )
  })
}
