/** Uma "mensagem": uma demanda ou pendência que uma wiki endereça a outra pessoa. */
export type Mensagem = {
  chave: string
  de: string
  para: string
  tipo: 'Demanda' | 'Pendência'
  id: string
  texto: string
  data: string
  situacao: 'aberta' | 'resolvida'
  arquivo: string
  /** Texto da pendência sem cortes. */
  completo: string
  /** Coluna "Origem" da pendência, sem Markdown. */
  origem: string
  /** Coluna "O que destrava" (abertas) ou "Como" (resolvidas). */
  destrava: string
  /** Páginas citadas na linha, relativas à pasta `wiki/` da wiki de origem. */
  links: string[]
}

/** Os detalhes que a IA monta para uma mensagem recebida. */
export type Detalhe = {
  estado: 'gerando' | 'pronto' | 'erro'
  motivo?: string
  detalhamento?: string
  /** null quando a wiki do leitor não dá apoio real a uma resposta. */
  sugestao?: string | null
  erro?: string
  geradoEm?: number
}

export type Leitura = {
  leitor: string
  raiz: string
  lidaEm: number
  erros: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'quadro-mensagens': {
      mensagens: Shaped<Mensagem[]>
      leitura: Shaped<Leitura | null>
      selecionada: string | null
      detalhes: Shaped<Record<string, Detalhe>>
    }
  }
}
