import "dotenv/config"
import { buscarTodasAsNoticias } from "./fetcher"
import { filtrarComIA } from "./llm"
import {
  montarEmbedsDiscord,
  enviarDiscord,
  enviarAlertaDiscord,
  extrairLinksDoPayload,
} from "./discord"
import { carregarHistorico, salvarHistorico, cmdBusca } from "./history"
import { cmdUrgente } from "./urgent"
import { ehSabado } from "./discord"

async function executar() {
  console.log("🚀 Iniciando Tech Briefing...\n")

  const { links: historicoLinks } = carregarHistorico()
  const noticias = await buscarTodasAsNoticias(historicoLinks)
  const semanal = ehSabado()

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

const comando = process.argv[2]

async function main() {
  if (comando === "busca") {
    const termo = process.argv[3]
    if (!termo) {
      console.error("Uso: npx tsx src/index.ts busca <termo>")
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
