export type Category = string

export interface Config {
  categorias: Record<string, { emoji: string; cor: string }>
  fontes: { url: string; categoria: string; nome: string }[]
  modelos: string[]
  fontes_urgentes: { url: string; nome: string }[]
  palavras_chave_urgentes: string[]
}

export interface Noticia {
  titulo: string
  link: string
  categoria: string | null
}

export interface HistoricoItem {
  link: string
  titulo: string
  data: string
}

export interface Historico {
  itens: HistoricoItem[]
}

export interface DiscordEmbed {
  title: string
  description: string
  color: number
}

export interface DiscordPayload {
  content: string
  embeds: DiscordEmbed[]
}
