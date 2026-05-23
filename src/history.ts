import { readFileSync, existsSync, writeFileSync } from "fs"
import { resolve } from "path"
import type { HistoricoItem, Historico } from "./types"

const HISTORICO_PATH = resolve("data/history.json")
const MAX_HISTORICO = 500

export function carregarHistorico(): {
  links: Set<string>
  itens: HistoricoItem[]
} {
  try {
    if (!existsSync(HISTORICO_PATH)) return { links: new Set(), itens: [] }
    const raw = readFileSync(HISTORICO_PATH, "utf-8")
    const data: Historico | { links: string[] } = JSON.parse(raw)

    if (Array.isArray((data as Historico).itens)) {
      return {
        links: new Set((data as Historico).itens.map((i) => i.link)),
        itens: (data as Historico).itens,
      }
    }

    if (Array.isArray((data as { links: string[] }).links)) {
      const links = (data as { links: string[] }).links
      const itens: HistoricoItem[] = links.map((link) => ({
        link,
        titulo: "",
        data: "",
      }))
      return { links: new Set(links), itens }
    }

    return { links: new Set(), itens: [] }
  } catch {
    console.warn("⚠️  Erro ao ler histórico, iniciando vazio")
    return { links: new Set(), itens: [] }
  }
}

export function salvarHistorico(
  novosItens: HistoricoItem[],
): void {
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

export function cmdBusca(termo: string): void {
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
