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

test('o painel mostra o que cada wiki endereça à outra', async ($, on) => {
  on('command.register', () => ({ value: { command: 'mensagens' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', (_, e) => ({
    value: String(e.path).split(String.fromCharCode(92)).join('/') !== RAIZ ? [] : [
      { name: 'wiki-Lucca Rossi', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'wiki-Vitor Saito', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))
  on('fs.read', (_, e) => ({ value: String(e.path).includes('Lucca') ? LUCCA : VITOR }))

  await $.session.start({ cwd: `${RAIZ}/wiki-Lucca Rossi`, surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Pendência P-012 · de Vitor Saito/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /Pendência P-026 · para Vitor Saito/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /Demanda · para Vitor Saito/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /P-003/ })).toBeFalsy()
    await ui.unmount()
  }
})

const USO = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const montar = (on: any, sugestao: string | null, prompts: string[]) => {
  on('command.register', () => ({ value: { command: 'mensagens' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.list', (_: unknown, e: any) => ({
    value: String(e.path).split(String.fromCharCode(92)).join('/') !== RAIZ ? [] : [
      { name: 'wiki-Lucca Rossi', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'wiki-Vitor Saito', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))
  on('fs.read', (_: unknown, e: any) => ({ value: String(e.path).includes('Lucca') ? LUCCA : VITOR }))
  on('model.complete', (_: unknown, e: any) => {
    prompts.push(String(e.prompt))
    return {
      value: {
        isAnswered: true,
        usage: USO,
        text: JSON.stringify({ motivo: 'Veio da comparação de depreciações (A-001.C8).', detalhamento: 'Escolher entre contábil e Fipe.', sugestao }),
      },
    }
  })
}

test('ver detalhes mostra motivo, detalhamento e sugestão', async ($, on) => {
  const prompts: string[] = []
  montar(on, 'Usar a Fipe por idade, segundo a decisão D-002 da sua wiki.', prompts)
  await $.session.start({ cwd: `${RAIZ}/wiki-Lucca Rossi`, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd-Vitor Saito|P-012|aberta' })
  expect(await ui.find({ type: 'Text', text: /Por que a pendência surgiu/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Sugestão de resposta/ })).toBeTruthy()
  expect(prompts[0]).toContain('analises/A-001-frota.md')
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
