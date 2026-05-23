import { readFileSync, existsSync, writeFileSync } from "fs"
import { resolve } from "path"
import RSSParser from "rss-parser"
import { config } from "./config"
import { buscarFonte } from "./fetcher"
import { enviarDiscord } from "./discord"

const URGENT_HISTORY_PATH = resolve("data/urgent-history.json")

function carregarUrgentHistory(): Set<string> {
  try {
    if (!existsSync(URGENT_HISTORY_PATH)) return new Set()
    return new Set(JSON.parse(readFileSync(URGENT_HISTORY_PATH, "utf-8")).links ?? [])
  } catch {
    return new Set()
  }
}

function salvarUrgentHistory(links: string[]): void {
  const existentes = carregarUrgentHistory()
  for (const l of links) existentes.add(l)
  writeFileSync(
    URGENT_HISTORY_PATH,
    JSON.stringify({ links: [...existentes].slice(-200) }, null, 2),
  )
}

export async function cmdUrgente(): Promise<void> {
  console.log("🚨 Verificando notícias urgentes...\n")

  const jaAlertados = carregarUrgentHistory()
  const parser = new RSSParser({
    timeout: 10000,
    headers: { "User-Agent": "TechBriefingBot/1.0" },
  })

  const palavrasChave = config.palavras_chave_urgentes.map((p) =>
    p.toLowerCase(),
  )

  const resultados = await Promise.allSettled(
    config.fontes_urgentes.map((f) =>
      buscarFonte(f.url, f.nome, null, parser, 20),
    ),
  )

  const urgentes: { titulo: string; link: string; match: string }[] = []

  for (const resultado of resultados) {
    if (resultado.status !== "fulfilled") continue
    for (const n of resultado.value) {
      if (jaAlertados.has(n.link)) continue
      const text = `${n.titulo}`.toLowerCase()
      const match = palavrasChave.find((kw) => text.includes(kw))
      if (match) {
        urgentes.push({ titulo: n.titulo, link: n.link, match })
      }
    }
  }

  if (urgentes.length === 0) {
    console.log("✅ Nenhuma notícia urgente nova.")
    return
  }

  console.log(`🔴 ${urgentes.length} notícia(s) urgente(s) encontrada(s):\n`)
  for (const u of urgentes) {
    console.log(`  [${u.match}] ${u.titulo}`)
    console.log(`  ${u.link}\n`)
  }

  if (process.env.DRY_RUN === "true") {
    console.log("⚠️  DRY_RUN ativo — não enviou nem salvou")
    return
  }

  const embeds = urgentes.slice(0, 10).map((u) => ({
    title: "🚨 Alerta Urgente",
    description: `**${u.titulo}**\nPalavra-chave: \`${u.match}\`\n<${u.link}>`,
    color: 0xed4245,
  }))

  await enviarDiscord({
    content: `🚨 **Notícias Urgentes — ${new Date().toLocaleDateString("pt-BR")}**`,
    embeds,
  })

  salvarUrgentHistory(urgentes.map((u) => u.link))
  console.log("✅ Alertas urgentes enviados e registrados")
}
