import type { EngineInterface } from 'claude-code'

import type { Detalhe, Mensagem, Resumo } from '../types'
import { semCodigos } from './resumos'

const MODELO = 'sonnet'
/** Pastas da wiki do leitor que entram como base para a sugestão de resposta. */
const PASTAS_LEITOR = ['analises', 'temas', 'reunioes', 'entregas']
const ARQUIVOS_LEITOR = ['projeto.md', 'estado-atual.md', 'decisoes.md']

const SISTEMA = `Você ajuda um consultor da Markestrat a entender uma pendência que um colega de equipe endereçou a ele em outra wiki de projeto.

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, no formato:
{"motivo": "...", "detalhamento": "...", "sugestao": "..." ou null}

- "motivo": por que a pendência surgiu, segundo a wiki do colega (a análise, conclusão, decisão ou reunião de onde veio e o problema que ela resolve). Se a wiki do colega não registrar o motivo, diga "Não registrado na wiki de <colega>".
- "detalhamento": o que exatamente está sendo pedido, as opções em jogo com números quando houver, o que a resposta destrava e o que o colega já fez ou sugeriu. Use só o que está nas páginas do colega.
- "sugestao": uma sugestão de resposta baseada EXCLUSIVAMENTE no que está na wiki do leitor. Use null quando a wiki do leitor não tiver conclusões, decisões, reuniões ou análises que realmente sustentem uma resposta. Não preencha com opinião genérica, com o que vem só da wiki do colega nem com conhecimento externo. Quando houver apoio parcial, diga o que a wiki sustenta e o que continua em aberto.

Regras de escrita (valem para os três campos):
- Português do Brasil, frases completas, sem abreviações internas, em Markdown simples (parágrafos curtos e listas). Sem títulos.
- NUNCA escreva códigos de identificação da wiki, como P-018, D-003, A-001, A-001.C10, C10, F-002, R-003 ou E-001, nem "pendência 12" ou "conclusão 10". O leitor não conhece os códigos: escreva o nome por extenso ("a análise do custo completo da frota", "a decisão de medir o custo do capital pela Fipe vezes a Selic", "a reunião de 23 de outubro com o ponto focal"). Diga de qual wiki é cada item ("na wiki de Vitor Saito", "na sua wiki").
- Uma afirmação de fonte não é fato comprovado: "segundo ..." . Diga o status das conclusões citadas (Hipótese, Interpretação, Acordada...).
- Não invente. O que não estiver nas páginas é "não registrado".`

async function ler($: EngineInterface, caminho: string) {
  try {
    return await $.fs.read(caminho)
  } catch {
    return null
  }
}

async function listarMd($: EngineInterface, pasta: string): Promise<string[]> {
  try {
    const saida: string[] = []
    for (const ent of await $.fs.list(pasta)) {
      if (ent.kind === 'dir') saida.push(...(await listarMd($, `${pasta}/${ent.name}`)))
      else if (ent.kind === 'file' && ent.name.endsWith('.md')) saida.push(`${pasta}/${ent.name}`)
    }
    return saida
  } catch {
    return []
  }
}

const bloco = (titulo: string, texto: string) => `<pagina caminho="${titulo}">\n${texto}\n</pagina>`

/** A wiki do leitor, como uma lista de páginas. Sempre o mesmo texto, para o cache. */
async function wikiDoLeitor($: EngineInterface, raiz: string, leitor: string) {
  const base = `${raiz}/wiki-${leitor}`
  const caminhos = [`${base}/index.md`, ...ARQUIVOS_LEITOR.map(a => `${base}/wiki/${a}`)]
  for (const p of PASTAS_LEITOR) caminhos.push(...(await listarMd($, `${base}/wiki/${p}`)))
  const partes: string[] = []
  for (const c of caminhos) {
    const t = await ler($, c)
    if (t !== null) partes.push(bloco(c.slice(base.length + 1), t))
  }
  return `<wiki_do_leitor dono="${leitor}">\n${partes.join('\n\n')}\n</wiki_do_leitor>`
}

/** As páginas da wiki de quem enviou que explicam a pendência. */
async function contextoDoColega($: EngineInterface, m: Mensagem) {
  const pastaWiki = m.arquivo.replace(/\/estado-atual\.md$/, '')
  const base = pastaWiki.replace(/\/wiki$/, '')
  const caminhos = [m.arquivo, `${pastaWiki}/decisoes.md`, `${base}/wiki/projeto.md`]
  for (const l of m.links) {
    const c = `${pastaWiki}/${l.replace(/^\.\//, '')}`
    if (!caminhos.includes(c)) caminhos.push(c)
  }
  const partes: string[] = []
  for (const c of caminhos) {
    const t = await ler($, c)
    if (t !== null) partes.push(bloco(c.slice(base.length + 1), t))
  }
  return `<wiki_do_colega dono="${m.de}">\n${partes.join('\n\n')}\n</wiki_do_colega>`
}

const pedido = (m: Mensagem, leitor: string, resumo?: Resumo) =>
  [
    resumo ? `Resumo já mostrado ao leitor: ${resumo.resumo}` : '',
    `O leitor é ${leitor}. A pendência abaixo foi endereçada a ele por ${m.de}, na wiki de ${m.de}.`,
    `Identificador na wiki de ${m.de}: ${m.id || '(demanda, sem identificador)'}`,
    `Tipo: ${m.tipo}. Situação: ${m.situacao}. Aberta em: ${m.data || 'não informado'}.`,
    `Texto: ${m.completo}`,
    m.origem ? `Origem: ${m.origem}` : '',
    m.destrava ? `O que destrava: ${m.destrava}` : '',
    '',
    'Monte o JSON pedido.',
  ]
    .filter(Boolean)
    .join('\n')

/** Tira códigos que tenham escapado, linha a linha, preservando o Markdown. */
const semCodigosMd = (s: string) =>
  s
    .split(String.fromCharCode(10))
    .map(l => {
      const lead = /^(\s*(?:[-*]|\d+\.)\s+)?/.exec(l)?.[0] ?? ''
      return lead + semCodigos(l.slice(lead.length))
    })
    .join(String.fromCharCode(10))

export const interpretar = (texto: string): Omit<Detalhe, 'estado'> | null => {
  const inicio = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (inicio < 0 || fim <= inicio) return null
  try {
    const j = JSON.parse(texto.slice(inicio, fim + 1)) as Record<string, unknown>
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const limpo = (v: string | null) => (v === null ? null : semCodigosMd(v))
    return {
      motivo: limpo(s(j.motivo)) ?? 'Não registrado.',
      detalhamento: limpo(s(j.detalhamento)) ?? 'Não registrado.',
      sugestao: limpo(s(j.sugestao)),
    }
  } catch {
    return null
  }
}

/** Gera os detalhes de uma mensagem recebida. Lê as wikis; não grava nada nelas. */
export async function gerarDetalhe(
  $: EngineInterface,
  raiz: string,
  leitor: string,
  m: Mensagem,
  resumo?: Resumo,
): Promise<Detalhe> {
  const [minha, colega] = [await wikiDoLeitor($, raiz, leitor), await contextoDoColega($, m)]
  const r = await $.model.complete({
    model: MODELO,
    system: SISTEMA,
    maxTokens: 3000,
    prompt: [{ text: minha, cache: true }, { text: colega }, { text: pedido(m, leitor, resumo) }],
  })
  if (!r.isAnswered) {
    const motivo = r.reason === 'api-error' ? `erro da API (${r.status ?? 'sem status'})` : r.reason
    return { estado: 'erro', erro: `O modelo não respondeu: ${motivo}.` }
  }
  const d = interpretar(r.text)
  if (!d) return { estado: 'erro', erro: 'A resposta do modelo não veio no formato esperado.' }
  return { estado: 'pronto', ...d, geradoEm: Date.now() }
}
