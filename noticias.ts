import "dotenv/config"
import RSSParser from "rss-parser"

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
    url: "https://www.reddit.com/r/MachineLearning/top/.rss?t=day&limit=10",
    categoria: "IA & LLMs" as Category,
    nome: "Reddit ML",
  },
  {
    url: "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day&limit=10",
    categoria: "IA & LLMs" as Category,
    nome: "Reddit LocalLLaMA",
  },
  {
    url: "https://feeds.feedburner.com/TheHackersNews",
    categoria: "Segurança" as Category,
    nome: "The Hacker News",
  },
  {
    url: "https://www.reddit.com/r/netsec/top/.rss?t=day&limit=10",
    categoria: "Segurança" as Category,
    nome: "Reddit netsec",
  },
  {
    url: "https://hnrss.org/frontpage?q=NestJS+Node+TypeScript+API&count=10",
    categoria: "Web & Backend" as Category,
    nome: "Hacker News – Web",
  },
  {
    url: "https://www.reddit.com/r/webdev/top/.rss?t=day&limit=10",
    categoria: "Web & Backend" as Category,
    nome: "Reddit webdev",
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
    url: "https://www.reddit.com/r/reactnative/top/.rss?t=day&limit=10",
    categoria: "Mobile" as Category,
    nome: "Reddit React Native",
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

async function buscarTodasAsNoticias() {
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
      const chave = noticia.titulo.toLowerCase().slice(0, 60)
      if (titulosVistos.has(chave)) continue
      titulosVistos.add(chave)
      noticias.push(noticia)
    }
  }

  console.log(
    `✅ ${noticias.length} notícias coletadas de ${FONTES.length} fontes`,
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

async function filtrarComIA(
  noticias: { titulo: string; link: string; categoria: Category }[],
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

  const instrucoes = `Você é um curador de notícias tech para um desenvolvedor fullstack e pentester brasileiro.

Hoje é ${hoje}. Abaixo estão notícias coletadas de vários sites. Sua tarefa:

1. Escolha as 2-3 mais relevantes e impactantes de CADA categoria
2. Escreva um resumo em português de no máximo 1 linha (máx 80 caracteres) para cada uma
3. Preserve o link original sem alterar
4. Priorize: lançamentos, vulnerabilidades críticas, mudanças de API, benchmarks
5. Descarte: tutoriais básicos, opiniões genéricas, anúncios de marketing

Responda SOMENTE com JSON puro, sem blocos de código, sem explicações:
{
  "categorias": [
    {
      "nome": "IA & LLMs",
      "noticias": [
        { "resumo": "texto curto em pt-BR", "link": "url original" }
      ]
    }
  ]
}

NOTÍCIAS DO DIA:
${noticiasPorCategoria}`

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

  const embeds: {
    title: string
    description: string
    color: number
  }[] = []

  const CORES: Record<Category, number> = {
    "IA & LLMs": 0x5865f2,
    Segurança: 0xed4245,
    "Web & Backend": 0x57f287,
    Mobile: 0xfeb801,
  }

  try {
    const dados = JSON.parse(jsonDaIA) as {
      categorias: {
        nome: Category
        noticias: { resumo: string; link: string }[]
      }[]
    }

    for (const categoria of dados.categorias) {
      if (!categoria.noticias?.length) continue
      const emoji = EMOJI_POR_CATEGORIA[categoria.nome] ?? "•"
      const linhas = categoria.noticias
        .map((n) => `› ${n.resumo}\n<${n.link}>`)
        .join("\n")
      embeds.push({
        title: `${emoji} ${categoria.nome}`,
        description: linhas,
        color: CORES[categoria.nome] ?? 0x2f3136,
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
    return
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
}

async function executar() {
  console.log("🚀 Iniciando Tech Briefing...\n")

  const noticias = await buscarTodasAsNoticias()
  const jsonDaIA = await filtrarComIA(noticias)
  const discordPayload = montarEmbedsDiscord(jsonDaIA)

  console.log("\n📋 Preview dos embeds do Discord:\n")
  console.log(JSON.stringify(discordPayload, null, 2))

  if (process.env.DRY_RUN === "true") {
    console.log("\n⚠️  Modo DRY_RUN ativo — nada foi enviado")
    return
  }

  await enviarDiscord(discordPayload)
}

executar().catch((erro) => {
  console.error("❌ Falha na execução:", erro)
  process.exit(1)
})
