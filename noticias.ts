import "dotenv/config"
import RSSParser from "rss-parser"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { resolve } from "path"

const HISTORICO_PATH = resolve("history.json")
const MAX_HISTORICO = 500

type Category = "IA & LLMs" | "Segurança" | "Web & Backend" | "Mobile"

const EMOJI_POR_CATEGORIA: Record<Category, string> = {
  "IA & LLMs": "🤖",
  Segurança: "🔐",
  "Web & Backend": "🌐",
  Mobile: "📱",
}

const FONTES = [
  {
    url: "https://hnrss.org/frontpage?q=AI+LLM+GPT+Claude+Gemini&count=15",
    categoria: "IA & LLMs" as Category,
    nome: "Hacker News – IA",
  },
  {
    url: "https://dev.to/feed/tag/artificial-intelligence",
    categoria: "IA & LLMs" as Category,
    nome: "Dev.to – IA",
  },
  {
    url: "https://dev.to/feed/tag/machine-learning",
    categoria: "IA & LLMs" as Category,
    nome: "Dev.to – ML",
  },
  {
    url: "https://feeds.feedburner.com/TheHackersNews",
    categoria: "Segurança" as Category,
    nome: "The Hacker News",
  },
  {
    url: "https://dev.to/feed/tag/security",
    categoria: "Segurança" as Category,
    nome: "Dev.to – Security",
  },
  {
    url: "https://hnrss.org/frontpage?q=NestJS+Node+TypeScript+API&count=10",
    categoria: "Web & Backend" as Category,
    nome: "Hacker News – Web",
  },
  {
    url: "https://dev.to/feed/tag/javascript",
    categoria: "Web & Backend" as Category,
    nome: "Dev.to – JavaScript",
  },
  {
    url: "https://dev.to/feed/tag/node",
    categoria: "Web & Backend" as Category,
    nome: "Dev.to – Node",
  },
  {
    url: "https://dev.to/feed/tag/typescript",
    categoria: "Web & Backend" as Category,
    nome: "Dev.to – TypeScript",
  },
  {
    url: "https://dev.to/feed/tag/react-native",
    categoria: "Mobile" as Category,
    nome: "Dev.to – React Native",
  },
  {
    url: "https://dev.to/feed/tag/expo",
    categoria: "Mobile" as Category,
    nome: "Dev.to – Expo",
  },
]

async function buscarFonte(fonte: (typeof FONTES)[0], parser: RSSParser) {
  try {
    const feed = await parser.parseURL(fonte.url)
    return (feed.items ?? [])
      .slice(0, 8)
      .map((item) => ({
        titulo: item.title?.replace(/\s+/g, " ").trim() ?? "",
        link: item.link ?? item.guid ?? "",
        categoria: fonte.categoria,
      }))
      .filter((noticia) => noticia.titulo && noticia.link)
  } catch {
    console.warn(`⚠️  Site indisponível: ${fonte.nome}`)
    return []
  }
}

async function buscarTodasAsNoticias(linksEnviados: Set<string>) {
  const parser = new RSSParser({
    timeout: 10000,
    headers: { "User-Agent": "TechBriefingBot/1.0" },
  })

  const resultados = await Promise.allSettled(
    FONTES.map((f) => buscarFonte(f, parser)),
  )

  const noticias: { titulo: string; link: string; categoria: Category }[] = []
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
    `✅ ${noticias.length} notícias inéditas de ${FONTES.length} fontes (${linksEnviados.size} no histórico)`,
  )
  return noticias
}

const MODELOS_IA = [
  "openai/gpt-oss-120b:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "z-ai/glm-4.5-air:free",
  "arcee-ai/trinity-large-thinking:free",
  "poolside/laguna-xs.2:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "baidu/cobuddy:free",
]

function isSabado(): boolean {
  return new Date().getDay() === 6
}

function montarInstrucoesIA(
  noticiasPorCategoria: string,
  hoje: string,
  semanal: boolean,
): string {
  if (semanal) {
    return `Você é um curador de notícias tech para um desenvolvedor fullstack e pentester brasileiro.

Hoje é ${hoje}, sábado — hora do resumo semanal! Abaixo estão as notícias do dia. Sua tarefa:

1. Escolha os 5 destaques MAIS IMPORTANTES da semana (independente de categoria)
2. Para cada um, escreva um parágrafo curto em português explicando por que importa (2-3 frases)
3. Preserve o link original sem alterar
4. Priorize: lançamentos, vulnerabilidades críticas, mudanças de API, benchmarks

Responda SOMENTE com JSON puro, sem blocos de código:
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

NOTÍCIAS DO DIA:
${noticiasPorCategoria}`
  }

  return `Você é um curador de notícias tech para um desenvolvedor fullstack e pentester brasileiro.

Hoje é ${hoje}. Abaixo estão notícias coletadas de vários sites. Sua tarefa:

1. Escolha as 2-3 mais relevantes e impactantes de CADA categoria
2. Escreva um parágrafo curto em português explicando por que importa (1-2 frases)
3. Preserve o link original sem alterar
4. Priorize: lançamentos, vulnerabilidades críticas, mudanças de API, benchmarks
5. Descarte: tutoriais básicos, opiniões genéricas, anúncios de marketing

Responda SOMENTE com JSON puro, sem blocos de código:
{
  "categorias": [
    {
      "nome": "IA & LLMs",
      "noticias": [
        { "resumo": "parágrafo curto", "link": "url original" }
      ]
    }
  ]
}

NOTÍCIAS DO DIA:
${noticiasPorCategoria}`
}

async function filtrarComIA(
  noticias: { titulo: string; link: string; categoria: Category }[],
  semanal: boolean,
) {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  const noticiasPorCategoria = (
    ["IA & LLMs", "Segurança", "Web & Backend", "Mobile"] as Category[]
  )
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

  const instrucoes = montarInstrucoesIA(noticiasPorCategoria, hoje, semanal)
  const erros: string[] = []

  for (const modelo of MODELOS_IA) {
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
            messages: [{ role: "user", content: instrucoes }],
            temperature: 0.3,
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
      return resultado
    } catch (err) {
      console.warn(`  💥  Erro de rede, pulando...`)
      erros.push(`${modelo}: ${String(err)}`)
    }
  }

  throw new Error(
    `Todos os modelos falharam:\n${erros.map((e) => `  • ${e}`).join("\n")}`,
  )
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

  const CORES: Record<string, number> = {
    "IA & LLMs": 0x5865f2,
    Segurança: 0xed4245,
    "Web & Backend": 0x57f287,
    Mobile: 0xfeb801,
  }

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

async function enviarDiscord(payload: {
  content: string
  embeds: { title: string; description: string; color: number }[]
}) {
  const { DISCORD_WEBHOOK_URL } = process.env

  if (!DISCORD_WEBHOOK_URL) {
    console.warn("⚠️ DISCORD_WEBHOOK_URL não configurado — pulando Discord")
    return false
  }

  const resposta = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!resposta.ok)
    throw new Error(
      `Erro ao enviar Discord: ${resposta.status} ${await resposta.text()}`,
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
    // silêncio — não podemos fazer nada se o alerta falhar
  }
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

function carregarHistorico(): Set<string> {
  try {
    if (!existsSync(HISTORICO_PATH)) return new Set()
    const raw = readFileSync(HISTORICO_PATH, "utf-8")
    const data = JSON.parse(raw) as { links: string[] }
    return new Set(data.links ?? [])
  } catch {
    console.warn("⚠️  Erro ao ler histórico, iniciando vazio")
    return new Set()
  }
}

function salvarHistorico(links: string[]) {
  const existentes = carregarHistorico()
  for (const link of links) existentes.add(link)
  const todos = [...existentes].slice(-MAX_HISTORICO)
  writeFileSync(HISTORICO_PATH, JSON.stringify({ links: todos }, null, 2))
  console.log(`💾 Histórico atualizado: ${todos.length} links`)

  if (process.env.GITHUB_ACTIONS === "true") {
    console.log("📎 history.json salvo — GitHub Action fará o commit")
  }
}

async function executar() {
  console.log("🚀 Iniciando Tech Briefing...\n")

  const historico = carregarHistorico()
  const noticias = await buscarTodasAsNoticias(historico)
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
    const linksDasNoticias = extrairLinksDoPayload(discordPayload)
    salvarHistorico(linksDasNoticias)
  }
}

executar().catch(async (erro) => {
  console.error("❌ Falha na execução:", erro)
  await enviarAlertaDiscord(String(erro))
  process.exit(1)
})
