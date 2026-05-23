import { CORES } from "./config"
import type { DiscordPayload, DiscordEmbed } from "./types"

export function ehSabado(): boolean {
  return new Date().getDay() === 6
}

export function montarEmbedsDiscord(jsonDaIA: string): DiscordPayload {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  })
  const dataFormatada = hoje.charAt(0).toUpperCase() + hoje.slice(1)
  const ehSemanal = ehSabado()

  const embeds: DiscordEmbed[] = []

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

export async function enviarDiscord(payload: DiscordPayload): Promise<boolean> {
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

export async function enviarAlertaDiscord(erro: string): Promise<void> {
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
    console.error("⚠️  Falha ao enviar alerta de erro no Discord")
  }
}

export function extrairLinksDoPayload(payload: DiscordPayload): string[] {
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
