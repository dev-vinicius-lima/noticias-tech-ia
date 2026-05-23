import "dotenv/config"
import RSSParser from "rss-parser"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { resolve } from "path"

const CONFIG_PATH = resolve("config.json")
const HISTORICO_PATH = resolve("history.json")
const MAX_HISTORICO = 500

type Category = string

interface Config {
  categorias: Record<string, { emoji: string; cor: string }>
  fontes: { url: string; categoria: string; nome: string }[]
  modelos: string[]
  fontes_urgentes: { url: string; nome: string }[]
  palavras_chave_urgentes: string[]
}

const config: Config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"))

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

const CORES: Record<string, number> = {}
for (const [cat, val] of Object.entries(config.categorias)) {
  CORES[cat] = hexToInt(val.cor)
}

const EMOJI_POR_CATEGORIA: Record<string, string> = {}
for (const [cat, val] of Object.entries(config.categorias)) {
  EMOJI_POR_CATEGORIA[cat] = val.emoji
}

const CATEGORIAS = Object.keys(config.categorias)

async function buscarFonte(
  url: string,
  nome: string,
  categoria: string | null,
  parser: RSSParser,
  limite = 8,
) {
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

async function buscarTodasAsNoticias(linksEnviados: Set<string>) {
  const parser = new RSSParser({
    timeout: 10000,
    headers: { "User-Agent": "TechBriefingBot/1.0" },
  })

  const resultados = await Promise.allSettled(
    config.fontes.map((f) => buscarFonte(f.url, f.nome, f.categoria, parser)),
  )

  const noticias: { titulo: string; link: string; categoria: string }[] = []
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

function isSabado(): boolean {
  return new Date().getDay() === 6
}

function montarInstrucoesIA(
  noticiasPorCategoria: string,
  hoje: string,
  semanal: boolean,
): { system: string; messages: { role: string; content: string }[] } {
  const system = `Você é um curador de notícias tech especializado em tecnologia para desenvolvedores brasileiros. Você é PRECISO, CONCISO e NUNCA inventa fatos. Se não tem certeza, omite.`

  const exemplos = `EXEMPLO DE SAÍDA CORRETA:
{
  "categorias": [
    {
      "nome": "Segurança",
      "noticias": [
        {
          "resumo": "npm agora exige 2FA para publicar e instalar pacotes, bloqueando ataques de supply chain que dependem de credenciais roubadas.",
          "link": "https://example.com/npm-2fa"
        }
      ]
    }
  ]
}`

  if (semanal) {
    const prompt = `Hoje é ${hoje}, sábado — resumo semanal! Abaixo estão notícias do dia.

INSTRUÇÕES:
1. Escolha os 5 destaques MAIS IMPORTANTES da semana (independente de categoria)
2. Cada resumo: 2-3 frases em português, mencione números/versões quando existirem
3. Preserve o link original sem alterar
4. Priorize: lançamentos, vulnerabilidades críticas, mudanças de API, benchmarks
5. REGRA DE OURO: NUNCA invente informações. Se o título não diz o suficiente, seja conservador no resumo.

FORMATO DE SAÍDA (JSON puro, sem \`\`\`):
{
  "categorias": [
    {
      "nome": "📆 Destaques da Semana",
      "noticias": [
        { "resumo": "parágrafo explicando o destaque", "link": "url original" }
      ]
    }
  ]
}

${exemplos}

NOTÍCIAS DO DIA:
${noticiasPorCategoria}`

    return { system, messages: [{ role: "user", content: prompt }] }
  }

  const prompt = `Hoje é ${hoje}. Abaixo estão notícias coletadas de vários sites.

INSTRUÇÕES:
1. Escolha as 2-3 mais relevantes e impactantes de CADA categoria
2. Cada resumo: 1-2 frases em português, mencione números/versões quando existirem
3. Preserve o link original sem alterar
4. Priorize: lançamentos, vulnerabilidades críticas, mudanças de API, benchmarks
5. Descarte: tutoriais básicos, opiniões genéricas, anúncios de marketing
6. REGRA DE OURO: NUNCA invente informações. Se o título não diz o suficiente, seja conservador.

FORMATO DE SAÍDA (JSON puro, sem \`\`\`):
{
  "categorias": [
    {
      "nome": "IA & LLMs",
      "noticias": [
        { "resumo": "parágrafo curto com dados concretos", "link": "url original" }
      ]
    }
  ]
}

${exemplos}

NOTÍCIAS DO DIA:
${noticiasPorCategoria}`

  return { system, messages: [{ role: "user", content: prompt }] }
}

async function consultarIA(
  system: string,
  messages: { role: string; content: string }[],
): Promise<{ texto: string; modelo: string }> {
  const erros: string[] = []

  for (const modelo of config.modelos) {
    console.log(`  🤖 Tentando modelo: ${modelo}`)
    try {
      const resposta = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/tech-briefing",
          },
          body: JSON.stringify({
            model: modelo,
            messages: [
              { role: "system", content: system },
              ...messages,
            ],
            temperature: 0.1,
          }),
        },
      )

      if (resposta.status === 429) {
        console.warn(`  ⏳  Rate-limited, pulando...`)
        erros.push(`${modelo}: 429 rate-limit`)
        continue
      }

      if (!resposta.ok) {
        const body = await resposta.text()
        console.warn(`  ❌  Erro ${resposta.status}, pulando...`)
        erros.push(`${modelo}: ${resposta.status} ${body.slice(0, 100)}`)
        continue
      }

      const dados = (await resposta.json()) as {
        choices: { message: { content: string } }[]
      }
      const textobruto = dados.choices[0]?.message?.content ?? "{}"
      const resultado = textobruto.replace(/```json|```/g, "").trim()

      console.log(`  ✅  Modelo ${modelo} respondeu com sucesso`)
      return { texto: resultado, modelo }
    } catch (err) {
      console.warn(`  💥  Erro de rede, pulando...`)
      erros.push(`${modelo}: ${String(err)}`)
    }
  }

  throw new Error(
    `Todos os modelos falharam:\n${erros.map((e) => `  • ${e}`).join("\n")}`,
  )
}

async function filtrarComIA(
  noticias: { titulo: string; link: string; categoria: string }[],
  semanal: boolean,
) {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  const noticiasPorCategoria = CATEGORIAS
    .map((cat) => {
      const dessa = noticias.filter((n) => n.categoria === cat)
      if (!dessa.length) return ""
      const linhas = dessa
        .map((n, i) => `${i + 1}. ${n.titulo} — ${n.link}`)
        .join("\n")
      return `### ${cat}\n${linhas}`
    })
    .filter(Boolean)
    .join("\n\n")

  const { system, messages } = montarInstrucoesIA(noticiasPorCategoria, hoje, semanal)
  const { texto } = await consultarIA(system, messages)
  return texto
}

function montarEmbedsDiscord(jsonDaIA: string) {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  })
  const dataFormatada = hoje.charAt(0).toUpperCase() + hoje.slice(1)
  const ehSemanal = isSabado()

  const embeds: {
    title: string
    description: string
    color: number
  }[] = []

  try {
    const dados = JSON.parse(jsonDaIA) as {
      categorias: {
        nome: string
        noticias: { resumo: string; link: string }[]
      }[]
    }

    for (const categoria of dados.categorias) {
      if (!categoria.noticias?.length) continue
      const linhas = categoria.noticias
        .map((n) => `${n.resumo}\n<${n.link}>`)
        .join("\n\n")
      embeds.push({
        title: ehSemanal ? "📆 Destaques da Semana" : categoria.nome,
        description: linhas,
        color: ehSemanal ? 0x9b59b6 : (CORES[categoria.nome] ?? 0x2f3136),
      })
    }
  } catch {
    embeds.push({
      title: "⚠️ Erro",
      description: "Não foi possível formatar as notícias de hoje.",
      color: 0xed4245,
    })
  }

  return {
    content: `📡 **Tech Briefing — ${dataFormatada}**`,
    embeds,
  }
}

interface HistoricoItem {
  link: string
  titulo: string
  data: string
}

interface Historico {
  itens: HistoricoItem[]
}

function carregarHistorico(): {
  links: Set<string>
  itens: HistoricoItem[]
} {
  try {
    if (!existsSync(HISTORICO_PATH)) return { links: new Set(), itens: [] }
    const raw = readFileSync(HISTORICO_PATH, "utf-8")
    const data = JSON.parse(raw)

    if (Array.isArray(data.itens)) {
      return {
        links: new Set(data.itens.map((i: HistoricoItem) => i.link)),
        itens: data.itens,
      }
    }

    if (Array.isArray(data.links)) {
      const itens = data.links.map((link: string) => ({
        link,
        titulo: "",
        data: "",
      }))
      return { links: new Set(data.links), itens }
    }

    return { links: new Set(), itens: [] }
  } catch {
    console.warn("⚠️  Erro ao ler histórico, iniciando vazio")
    return { links: new Set(), itens: [] }
  }
}

function salvarHistorico(
  novosItens: { link: string; titulo: string; data: string }[],
) {
  const { itens: existentes } = carregarHistorico()
  const linksExistentes = new Set(existentes.map((i) => i.link))

  for (const item of novosItens) {
    if (!linksExistentes.has(item.link)) {
      existentes.push(item)
      linksExistentes.add(item.link)
    }
  }

  const todos = existentes.slice(-MAX_HISTORICO)
  writeFileSync(
    HISTORICO_PATH,
    JSON.stringify({ itens: todos }, null, 2),
  )
  console.log(`💾 Histórico atualizado: ${todos.length} itens`)
}

function extrairLinksDoPayload(payload: {
  content: string
  embeds: { description: string }[]
}): string[] {
  const links: string[] = []
  const regex = /<(.+?)>/g
  for (const embed of payload.embeds) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(embed.description)) !== null) {
      links.push(match[1])
    }
  }
  return links
}

async function enviarDiscord(payload: {
  content: string
  embeds: { title: string; description: string; color: number }[]
}) {
  const { DISCORD_WEBHOOK_URL } = process.env
  if (!DISCORD_WEBHOOK_URL) {
    console.warn("⚠️ DISCORD_WEBHOOK_URL não configurado")
    return false
  }

  const resposta = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!resposta.ok)
    throw new Error(
      `Erro no Discord: ${resposta.status} ${await resposta.text()}`,
    )
  console.log("✅ Mensagem enviada no Discord com sucesso")
  return true
}

async function enviarAlertaDiscord(erro: string) {
  const { DISCORD_WEBHOOK_URL } = process.env
  if (!DISCORD_WEBHOOK_URL) return
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "🚨 **Tech Briefing — Falha na execução**",
        embeds: [
          {
            title: "❌ Erro",
            description: `\`\`\`\n${erro.slice(0, 2000)}\n\`\`\``,
            color: 0xed4245,
          },
        ],
      }),
    })
  } catch {
    // silêncio
  }
}

// ─── CLI: busca ──────────────────────────────────────────────────────────

function cmdBusca(termo: string) {
  const { itens } = carregarHistorico()
  const termoLower = termo.toLowerCase()

  const resultados = itens.filter(
    (i) =>
      i.link.toLowerCase().includes(termoLower) ||
      i.titulo.toLowerCase().includes(termoLower),
  )

  if (resultados.length === 0) {
    console.log("Nenhum resultado encontrado.")
    return
  }

  console.log(`\n🔍 ${resultados.length} resultado(s) para "${termo}":\n`)
  for (const r of resultados) {
    const data = r.data ? `[${r.data}]` : ""
    const titulo = r.titulo || "(sem título)"
    console.log(`  ${data} ${titulo}`)
    console.log(`  ${r.link}\n`)
  }
}

// ─── CLI: urgente ────────────────────────────────────────────────────────

const URGENT_HISTORY_PATH = resolve("urgent-history.json")

function carregarUrgentHistory(): Set<string> {
  try {
    if (!existsSync(URGENT_HISTORY_PATH)) return new Set()
    return new Set(JSON.parse(readFileSync(URGENT_HISTORY_PATH, "utf-8")).links ?? [])
  } catch {
    return new Set()
  }
}

function salvarUrgentHistory(links: string[]) {
  const existentes = carregarUrgentHistory()
  for (const l of links) existentes.add(l)
  writeFileSync(
    URGENT_HISTORY_PATH,
    JSON.stringify({ links: [...existentes].slice(-200) }, null, 2),
  )
}

async function cmdUrgente() {
  console.log("🚨 Verificando notícias urgentes...\n")

  const jaAlertados = carregarUrgentHistory()
  const parser = new RSSParser({
    timeout: 10000,
    headers: { "User-Agent": "TechBriefingBot/1.0" },
  })

  const palavrasChave = config.palavras_chave_urgentes.map((p) =>
    p.toLowerCase(),
  )

  const urgentes: { titulo: string; link: string; match: string }[] = []

  for (const fonte of config.fontes_urgentes) {
    const noticias = await buscarFonte(fonte.url, fonte.nome, null, parser, 20)
    for (const n of noticias) {
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

// ─── Execução principal ──────────────────────────────────────────────────

async function executar() {
  console.log("🚀 Iniciando Tech Briefing...\n")

  const { links: historicoLinks } = carregarHistorico()
  const noticias = await buscarTodasAsNoticias(historicoLinks)
  const semanal = isSabado()

  if (noticias.length === 0) {
    console.log("\n✅ Nenhuma notícia nova hoje — nada a enviar")
    return
  }

  const jsonDaIA = await filtrarComIA(noticias, semanal)
  const discordPayload = montarEmbedsDiscord(jsonDaIA)

  console.log(`\n📋 Preview (${semanal ? "semanal" : "diário"}):\n`)
  console.log(JSON.stringify(discordPayload, null, 2))

  if (process.env.DRY_RUN === "true") {
    console.log("\n⚠️  Modo DRY_RUN ativo — nada foi enviado")
    return
  }

  const enviado = await enviarDiscord(discordPayload)

  if (enviado) {
    const linksEnviados = extrairLinksDoPayload(discordPayload)
    const hoje = new Date().toLocaleDateString("pt-BR")
    const tituloMap = new Map(noticias.map((n) => [n.link, n.titulo]))
    const novosItens = linksEnviados.map((link) => ({
      link,
      titulo: tituloMap.get(link) ?? "",
      data: hoje,
    }))
    salvarHistorico(novosItens)
  }
}

// ─── CLI: dispatch ───────────────────────────────────────────────────────

const comando = process.argv[2]

async function main() {
  if (comando === "busca") {
    const termo = process.argv[3]
    if (!termo) {
      console.error("Uso: npx tsx noticias.ts busca <termo>")
      process.exit(1)
    }
    cmdBusca(termo)
    return
  }

  if (comando === "urgente") {
    await cmdUrgente()
    return
  }

  await executar()
}

main().catch(async (erro) => {
  console.error("❌ Falha na execução:", erro)
  await enviarAlertaDiscord(String(erro))
  process.exit(1)
})
