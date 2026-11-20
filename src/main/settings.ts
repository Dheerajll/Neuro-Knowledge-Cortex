import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface Settings {
  llm: { enabled: boolean; baseUrl: string; model: string; apiKey: string }
  embedding: { mode: 'local' | 'api'; baseUrl: string; model: string; apiKey: string }
  edgeThreshold: number
  minScore: number
}

const DEFAULTS: Settings = {
  llm: { enabled: false, baseUrl: 'https://api.venice.ai/api/v1', model: '', apiKey: '' },
  embedding: { mode: 'local', baseUrl: 'https://api.venice.ai/api/v1', model: '', apiKey: '' },
  edgeThreshold: 0.34,
  minScore: 0.08
}

let current: Settings | null = null

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function settings(): Settings {
  if (current) return current
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<Settings>
    current = {
      ...DEFAULTS,
      ...raw,
      llm: { ...DEFAULTS.llm, ...(raw.llm ?? {}) },
      embedding: { ...DEFAULTS.embedding, ...(raw.embedding ?? {}) }
    }
  } catch {
    current = { ...DEFAULTS }
  }
  return current
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const merged: Settings = {
    ...settings(),
    ...patch,
    llm: { ...settings().llm, ...(patch.llm ?? {}) },
    embedding: { ...settings().embedding, ...(patch.embedding ?? {}) }
  }
  current = merged
  fs.writeFileSync(file(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}