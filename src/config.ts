import { readFileSync } from "fs"
import { resolve } from "path"
import type { Config } from "./types"

const CONFIG_PATH = resolve("data/config.json")

const raw = readFileSync(CONFIG_PATH, "utf-8")
export const config: Config = JSON.parse(raw)

function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

export const CORES: Record<string, number> = {}
export const EMOJI_POR_CATEGORIA: Record<string, string> = {}

for (const [cat, val] of Object.entries(config.categorias)) {
  CORES[cat] = hexToInt(val.cor)
  EMOJI_POR_CATEGORIA[cat] = val.emoji
}

export const CATEGORIAS = Object.keys(config.categorias)
