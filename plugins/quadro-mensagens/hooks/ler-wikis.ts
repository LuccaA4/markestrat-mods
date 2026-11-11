import type { Mensagem } from '../types'

/** Nome do dono a partir da pasta `wiki-<Nome>`. */
export const donoDaPasta = (pasta: string): string | null => {
  const m = /^wiki-(.+)$/.exec(pasta)
  return m?.[1] ? m[1].trim() : null
}

/** Pasta que reúne as wikis do projeto, a partir do diretório da sessão. */
export const acharRaiz = (cwd: string): { raiz: string; leitor: string } | null => {
  const partes = cwd.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  for (let i = partes.length - 1; i > 0; i--) {
    const dono = donoDaPasta(partes[i] ?? '')
    if (dono) return { raiz: partes.slice(0, i).join('/'), leitor: dono }
  }
  return null
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Tira negrito, links e crases do Markdown e corta o texto. */
export const limpar = (s: string, max = 260): string => {
  const t = s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Uma linha de pendência é endereçada a outra pessoa quando diz
 * "Responsável: <Nome>", "Combinar com <Nome>", "Validar com <Nome>",
 * "Levar a <Nome>", "Perguntar a <Nome>" ou "Pedir a <Nome>".
 */
const destinatario = (texto: string, nomes: string[]): string | null => {
  const plano = texto.replace(/\*\*/g, '')
  for (const nome of nomes) {
    const re = new RegExp(
      `(respons[áa]vel:\\s*|combinar com\\s+|validar com\\s+|levar (?:a|para)\\s+|perguntar (?:a|para)\\s+|pedir (?:a|para)\\s+)${escapar(nome)}`,
      'i',
    )
    if (re.test(plano)) return nome
  }
  return null
}

/** Links Markdown para páginas da própria wiki (sem http e sem ir a raw/). */
export const linksInternos = (s: string): string[] => {
  const saida: string[] = []
  for (const m of s.matchAll(/\]\(<?([^)>]+?)>?\)/g)) {
    const href = (m[1] ?? '').split('#')[0] ?? ''
    if (!href || /^[a-z]+:/i.test(href) || !href.endsWith('.md') || href.includes('..')) continue
    if (!saida.includes(href)) saida.push(href)
  }
  return saida
}

const celulas = (linha: string): string[] =>
  linha.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())

/**
 * Lê o `wiki/estado-atual.md` de uma wiki e devolve o que ela endereça a outras
 * pessoas: as demandas da seção "Demandas da equipe" e as pendências abertas ou
 * resolvidas que nomeiam um responsável.
 */
export const lerEstadoAtual = (
  texto: string,
  dono: string,
  outros: string[],
  arquivo: string,
): Mensagem[] => {
  const saida: Mensagem[] = []
  let secao = ''
  for (const linha of texto.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*$/.exec(linha)
    if (h2) {
      secao = (h2[1] ?? '').toLowerCase()
      continue
    }
    if (secao.startsWith('demandas da equipe')) {
      const h3 = /^###\s+(.+?)\s+[—–-]\s+(.+?)\s*$/.exec(linha)
      if (h3) {
        const pessoa = (h3[1] ?? '').trim().toLowerCase()
        const resto = h3[2] ?? ''
        const para = outros.find(n => n.toLowerCase() === pessoa)
        if (!para) continue
        const data = /atribu[íi]d[ao] em (\d{4}-\d{2}-\d{2})/i.exec(resto)?.[1] ?? ''
        const assunto = resto.replace(/\s*\(atribu[íi]d[ao] em [^)]*\)\s*$/i, '')
        saida.push({
          chave: `${dono}|demanda|${para}|${assunto}`,
          de: dono,
          para,
          tipo: 'Demanda',
          id: '',
          texto: limpar(assunto),
          data,
          situacao: 'aberta',
          arquivo,
          completo: limpar(assunto, 100000),
          origem: '',
          destrava: '',
          links: [],
        })
      }
      continue
    }
    const aberta = secao.startsWith('pendências abertas') || secao.startsWith('pendencias abertas')
    const resolvida =
      secao.startsWith('pendências resolvidas') || secao.startsWith('pendencias resolvidas')
    if ((aberta || resolvida) && /^\s*\|\s*P-\d+/.test(linha)) {
      const c = celulas(linha)
      const para = destinatario(c[1] ?? '', outros)
      if (!para) continue
      const id = c[0] ?? ''
      saida.push({
        chave: `${dono}|${id}|${aberta ? 'aberta' : 'resolvida'}`,
        de: dono,
        para,
        tipo: 'Pendência',
        id,
        texto: limpar(c[1] ?? ''),
        data: (aberta ? c[3] : c[2]) ?? '',
        situacao: aberta ? 'aberta' : 'resolvida',
        arquivo,
        completo: limpar(c[1] ?? '', 100000),
        origem: aberta ? limpar(c[2] ?? '', 100000) : '',
        destrava: limpar((aberta ? c[4] : c[3]) ?? '', 100000),
        links: linksInternos(`${c[1] ?? ''} ${aberta ? (c[2] ?? '') : ''}`),
      })
    }
  }
  return saida
}
