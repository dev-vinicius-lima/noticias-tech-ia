import { config, CATEGORIAS } from "./config"
import type { Noticia } from "./types"

function montarInstrucoesIA(
  noticiasPorCategoria: string,
  hoje: string,
  semanal: boolean,
): { system: string; messages: { role: string; content: string }[] } {
  const system = "Você é um curador de notícias tech especializado em tecnologia para desenvolvedores brasileiros. Você é PRECISO, CONCISO e NUNCA inventa fatos. Se não tem certeza, omite."

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

export async function filtrarComIA(
  noticias: Noticia[],
  semanal: boolean,
): Promise<string> {
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
