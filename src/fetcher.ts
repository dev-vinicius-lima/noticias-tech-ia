import RSSParser from "rss-parser"
import { config } from "./config"
import type { Noticia } from "./types"

async function buscarFonte(
  url: string,
  nome: string,
  categoria: string | null,
  parser: RSSParser,
  limite = 8,
): Promise<Noticia[]> {
  try {
    const feed = await parser.parseURL(url)
    return (feed.items ?? [])
      .slice(0, limite)
      .map((item) => ({
        titulo: item.title?.replace(/\s+/g, " ").trim() ?? "",
        link: item.link ?? item.guid ?? "",
        categoria,
      }))
      .filter((n) => n.titulo && n.link)
  } catch {
    console.warn(`⚠️  Site indisponível: ${nome}`)
    return []
  }
}

export async function buscarTodasAsNoticias(
  linksEnviados: Set<string>,
): Promise<Noticia[]> {
  const parser = new RSSParser({
    timeout: 10000,
    headers: { "User-Agent": "TechBriefingBot/1.0" },
  })

  const resultados = await Promise.allSettled(
    config.fontes.map((f) => buscarFonte(f.url, f.nome, f.categoria, parser)),
  )

  const noticias: Noticia[] = []
  const titulosVistos = new Set<string>()

  for (const resultado of resultados) {
    if (resultado.status !== "fulfilled") continue
    for (const noticia of resultado.value) {
      if (linksEnviados.has(noticia.link)) continue
      const chave = noticia.titulo.toLowerCase().slice(0, 60)
      if (titulosVistos.has(chave)) continue
      titulosVistos.add(chave)
      noticias.push(noticia)
    }
  }

  console.log(
    `✅ ${noticias.length} notícias inéditas de ${config.fontes.length} fontes (${linksEnviados.size} no histórico)`,
  )
  return noticias
}

export { buscarFonte }
