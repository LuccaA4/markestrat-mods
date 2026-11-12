import { expect, test } from 'claude-code/testing'

const RAIZ = 'C:/Proj/8. Wiki'
const LUCCA = [
  '## Demandas da equipe',
  '### Vitor Saito — custo da frota (atribuído em 2026-11-04)',
  '## Pendências abertas',
  '| ID | Pendência | Origem | Aberta em | O que destrava |',
  '|---|---|---|---|---|',
  '| P-026 | **Responsável: Vitor Saito.** Levantar a Fipe | D-002 | 2026-11-04 | ABC |',
  '| P-003 | Confirmar acordo de confidencialidade | F-001 | 2026-10-20 | — |',
].join('\n')
const VITOR = [
  '# A-001 — Custo completo da frota própria',
  '### A-001.C8 — A depreciação contábil é maior que a variação de mercado',
  '## Pendências abertas',
  '| ID | Pendência | Origem | Aberta em | O que destrava |',
  '|---|---|---|---|---|',
  '| P-012 | Combinar com Lucca Rossi qual depreciação entra | [A-001.C8](analises/A-001-frota.md) | 2026-11-06 | ABC |',
].join('\n')

const PANE = {
  plugin: 'quadro-mensagens',
  component: 'Pane',
  requestId: 'quadro-mensagens',
  props: {
    title: 'Mensagens da equipe',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USO = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const barra = (p: unknown) => String(p).split(String.fromCharCode(92)).join('/')

const montar = (on: any, sugestao: string | null, pedidos: string[]) => {
  on('command.register', () => ({ value: { command: 'mensagens' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  const guardado: Record<string, unknown> = {}
  on('store.get', (_: unknown, e: any) => ({ value: guardado[e.key] }))
  on('store.set', (_: unknown, e: any) => {
    guardado[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.list', (_: unknown, e: any) => {
    const p = barra(e.path)
    if (p === RAIZ)
      return {
        value: [
          { name: 'wiki-Lucca Rossi', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
          { name: 'wiki-Vitor Saito', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
        ],
      }
    if (p.endsWith('/wiki'))
      return { value: [{ name: 'estado-atual.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false }] }
    return { value: [] }
  })
  on('fs.read', (_: unknown, e: any) => ({ value: barra(e.path).includes('Lucca') ? LUCCA : VITOR }))
  on('model.complete', (_: unknown, e: any) => {
    pedidos.push(String(e.prompt))
    if (String(e.system).includes('array JSON')) {
      const chaves = [...String(e.prompt).matchAll(/chave="([^"]+)"/g)].map(m => m[1])
      const texto = JSON.stringify(
        chaves.map(c => ({
          chave: c,
          resumo: 'Definir qual depreciação entra no custeio do frete (A-001.C8).',
          origem: 'a análise do custo completo da frota',
          destrava: 'fechar o custo da frota',
        })),
      )
      return { value: { isAnswered: true, usage: USO, text: texto } }
    }
    return {
      value: {
        isAnswered: true,
        usage: USO,
        text: JSON.stringify({
          motivo: 'Veio da comparação entre a depreciação contábil e a de mercado (A-001.C8).',
          detalhamento: 'Escolher entre a contábil e a Fipe.',
          sugestao,
        }),
      },
    }
  })
}

const CODIGO = /\b[ADEFPR]-\d{3}/

test('os cartões mostram o resumo sem códigos, em toda superfície', async ($, on) => {
  const pedidos: string[] = []
  montar(on, null, pedidos)
  await $.session.start({ cwd: `${RAIZ}/wiki-Lucca Rossi`, surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const textos = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
    expect(textos.some(t => /^Pendência · de Vitor Saito · 2026-11-06$/.test(t))).toBe(true)
    expect(textos.some(t => /^Pendência · para Vitor Saito/.test(t))).toBe(true)
    expect(textos.some(t => /^Demanda · para Vitor Saito/.test(t))).toBe(true)
    expect(textos.some(t => t.startsWith('Definir qual depreciação entra'))).toBe(true)
    expect(textos.filter(t => CODIGO.test(t))).toEqual([])
    await ui.unmount()
  }
  // O glossário da wiki do Vitor foi enviado para traduzir o código da origem.
  expect(pedidos[0]).toContain('A-001.C8: A depreciação contábil')
})

test('ver detalhes mostra motivo, detalhamento e sugestão, sem códigos', async ($, on) => {
  const pedidos: string[] = []
  montar(on, 'Usar a Fipe por idade, como na decisão D-002 da sua wiki.', pedidos)
  await $.session.start({ cwd: `${RAIZ}/wiki-Lucca Rossi`, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd-Vitor Saito|P-012|aberta' })
  expect(await ui.find({ type: 'Text', text: /Por que a pendência surgiu/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sugestão de resposta/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /De onde veio: a análise do custo completo/ })).toBeTruthy()
  const md = (await ui.findAll({ type: 'Markdown' } as any)).map((t: any) => t.text ?? t.props?.text ?? '')
  expect(md.join(' ')).not.toMatch(CODIGO)
  expect(pedidos.some(p => p.includes('analises/A-001-frota.md'))).toBe(true)
  await ui.press({ key: 'voltar' })
  expect(await ui.find({ type: 'Text', text: /Para você/ })).toBeTruthy()
  await ui.unmount()
})

test('sem apoio na wiki, a sugestão não aparece', async ($, on) => {
  montar(on, null, [])
  await $.session.start({ cwd: `${RAIZ}/wiki-Lucca Rossi`, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd-Vitor Saito|P-012|aberta' })
  expect(await ui.find({ type: 'Text', text: /Detalhamento/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sugestão de resposta/ })).toBeFalsy()
  await ui.unmount()
})
