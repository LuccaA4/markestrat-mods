import type { EngineInterface } from 'claude-code'

import type { Mensagem, Resumo } from '../types'
import { RE_CODIGO, codigosEm, glossarioDe } from './ler-wikis'

const MODELO = 'sonnet'
const CHAVE_STORE = 'resumos-1'

const SISTEMA = `Você reescreve pendências e demandas de wikis de projeto da Markestrat para um painel de mensagens entre consultores. O leitor não conhece os códigos internos da wiki.

Responda SOMENTE com um array JSON, sem texto antes ou depois, com um objeto por mensagem recebida:
[{"chave": "...", "resumo": "...", "origem": "...", "destrava": "..."}]

- "resumo": o que está sendo pedido ou combinado, em uma a três frases completas, com os números essenciais. Não repita quem enviou nem a data: o painel já mostra.
- "origem": de onde a mensagem veio, escrito por extenso (por exemplo, "a conclusão da análise do custo completo da frota de que as 27 placas próprias custam R$ 4,08 milhões por ano"). Texto vazio quando não houver origem.
- "destrava": o que a resposta permite fazer. Texto vazio quando não houver.

Regras:
- NUNCA escreva códigos de identificação, como P-018, D-003, A-001, A-001.C10, C10, F-002, R-003 ou E-001, nem expressões como "pendência 12" ou "conclusão 10". Troque cada código pelo que ele significa, usando o glossário. Se um código não estiver no glossário, descreva-o pelo contexto ou omita-o.
- Use só o texto da mensagem e o glossário. Não invente.
- Português do Brasil, frases completas, sem abreviações internas e sem Markdown.`

async function lerSeguro($: EngineInterface, caminho: string) {
  try {
    return await $.fs.read(caminho)
  } catch {
    return null
  }
}

async function paginasMd($: EngineInterface, pasta: string): Promise<string[]> {
  try {
    const saida: string[] = []
    for (const ent of await $.fs.list(pasta)) {
      if (ent.kind === 'dir') saida.push(...(await paginasMd($, `${pasta}/${ent.name}`)))
      else if (ent.kind === 'file' && ent.name.endsWith('.md')) saida.push(`${pasta}/${ent.name}`)
    }
    return saida
  } catch {
    return []
  }
}

/** O glossário de códigos de uma wiki inteira (a pasta `wiki/` dela). */
async function glossarioDaWiki($: EngineInterface, pastaWiki: string) {
  const g: Record<string, string> = {}
  for (const c of await paginasMd($, pastaWiki)) {
    const t = await lerSeguro($, c)
    if (t !== null) Object.assign(g, glossarioDe(t))
  }
  return g
}

/** Os verbetes que interessam a uma mensagem: os códigos dela e as conclusões das análises citadas. */
const verbetes = (m: Mensagem, g: Record<string, string>) => {
  const cods = codigosEm(`${m.completo} ${m.origem} ${m.destrava}`)
  const analises = cods.map(c => c.slice(0, 5)).filter(c => c.startsWith('A-'))
  const escolhidos = new Set(cods)
  for (const k of Object.keys(g)) if (analises.some(a => k.startsWith(a))) escolhidos.add(k)
  return [...escolhidos]
    .filter(k => g[k])
    .map(k => `${k}: ${g[k]}`)
    .join('\n')
}

/** Tira o que sobrar de código depois da reescrita, como segurança. */
export const semCodigos = (s: string) =>
  s
    .replace(/\s*\((?:\s*[;,e]?\s*\b(?:[ADEFPR]-\d{3}(?:\.C\d+)?|C\d+)\b)+\s*\)/g, '')
    .replace(RE_CODIGO, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

export const interpretarResumos = (texto: string): Record<string, Resumo> => {
  const saida: Record<string, Resumo> = {}
  const ini = texto.indexOf('[')
  const fim = texto.lastIndexOf(']')
  if (ini < 0 || fim <= ini) return saida
  try {
    const lista = JSON.parse(texto.slice(ini, fim + 1)) as unknown
    if (!Array.isArray(lista)) return saida
    for (const item of lista as Record<string, unknown>[]) {
      const s = (v: unknown) => (typeof v === 'string' ? semCodigos(v) : '')
      if (typeof item.chave !== 'string' || !s(item.resumo)) continue
      saida[item.chave] = { resumo: s(item.resumo), origem: s(item.origem), destrava: s(item.destrava) }
    }
  } catch {
    // Resposta fora do formato: fica para a próxima leitura.
  }
  return saida
}

/** Resumos já guardados (de sessões anteriores também), por assinatura. */
export async function resumosGuardados($: EngineInterface): Promise<Record<string, Resumo>> {
  const v = await $.store.get(CHAVE_STORE)
  return v && typeof v === 'object' ? (v as Record<string, Resumo>) : {}
}

/**
 * Reescreve, sem códigos, as mensagens que ainda não têm resumo. Uma chamada ao
 * modelo para todas. Lê as wikis; não grava nada nelas.
 */
export async function resumirFaltantes(
  $: EngineInterface,
  msgs: Mensagem[],
): Promise<Record<string, Resumo>> {
  const guardados = await resumosGuardados($)
  const faltam = msgs.filter(m => !guardados[m.assinatura])
  if (faltam.length === 0) return guardados

  const glossarios: Record<string, Record<string, string>> = {}
  for (const m of faltam) {
    const pasta = m.arquivo.replace(/\/estado-atual\.md$/, '')
    if (!glossarios[pasta]) glossarios[pasta] = await glossarioDaWiki($, pasta)
  }

  const pedido = faltam
    .map(m => {
      const g = glossarios[m.arquivo.replace(/\/estado-atual\.md$/, '')] ?? {}
      return [
        `<mensagem chave="${m.assinatura}">`,
        `De: ${m.de}. Para: ${m.para}. Tipo: ${m.tipo}. Situação: ${m.situacao}.`,
        `Texto: ${m.completo}`,
        m.origem ? `Origem: ${m.origem}` : '',
        m.destrava ? `${m.situacao === 'aberta' ? 'O que destrava' : 'Como foi resolvida'}: ${m.destrava}` : '',
        `Glossário da wiki de ${m.de}:\n${verbetes(m, g) || '(nenhum código)'}`,
        '</mensagem>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  const r = await $.model.complete({ model: MODELO, system: SISTEMA, maxTokens: 6000, prompt: pedido })
  if (!r.isAnswered) return guardados
  const novos = interpretarResumos(r.text)
  const todos = { ...guardados, ...novos }
  // Guarda só o que ainda está em uso, para o armazenamento não crescer sem fim.
  const emUso = new Set(msgs.map(m => m.assinatura))
  const enxuto = Object.fromEntries(Object.entries(todos).filter(([k]) => emUso.has(k)))
  await $.store.set(CHAVE_STORE, enxuto)
  return enxuto
}
