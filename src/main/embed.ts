import { settings } from './settings'
import { PHRASES, STOP, WORDMAP } from './lexicon'

const DIM = 384

function singular(word: string): string {
  if (/(xes|ches|shes|sses|zes)$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

export function canon(word: string): string {
  if (WORDMAP[word]) return WORDMAP[word]
  const base = singular(word)
  return WORDMAP[base] ?? base
}

export function tokenize(text: string): string[] {
  const raw = String(text).toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []
  return raw
    .filter((w) => w.length >= 2 && !STOP.has(w) && !STOP.has(singular(w)))
    .map(canon)
}

function fnv1a(str: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function add(vec: Float32Array, term: string, weight: number): void {
  const h = fnv1a(term)
  const sign = fnv1a(term, 0x9e3779b9) & 1 ? -1 : 1
  vec[h % DIM] += sign * weight
}

export function localEmbed(title: string, body: string, tags: string[]): Float32Array {
  const vec = new Float32Array(DIM)
  const titleTokens = tokenize(title)
  const tagTokens = tags.flatMap(tokenize)
  const bodyTokens = tokenize(body)

  for (const t of titleTokens) add(vec, t, 3)
  for (const t of tagTokens) add(vec, t, 2)
  for (const t of bodyTokens) add(vec, t, 1)

  const sequence = [...titleTokens, ...tagTokens, ...bodyTokens]
  for (let i = 0; i < sequence.length - 1; i++) add(vec, `${sequence[i]}_${sequence[i + 1]}`, 0.6)

  const full = `${title} ${tags.join(' ')} ${body}`.toLowerCase()
  for (const [phrase, target] of PHRASES) {
    if (full.includes(phrase)) add(vec, target, 2.5)
  }

  for (const t of sequence) {
    if (t.length < 5) continue
    const padded = `^${t}$`
    for (let i = 0; i < padded.length - 2; i++) add(vec, `#${padded.slice(i, i + 3)}`, 0.2)
  }

  let norm = 0
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm
  return vec
}

async function remoteEmbed(text: string): Promise<Float32Array | null> {
  const cfg = settings().embedding
  if (cfg.mode !== 'api' || !cfg.baseUrl || !cfg.model) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {})
      },
      body: JSON.stringify({ model: cfg.model, input: text.slice(0, 6000) }),
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    const raw = json.data?.[0]?.embedding
    if (!raw?.length) return null
    const vec = Float32Array.from(raw)
    let norm = 0
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
    norm = Math.sqrt(norm)
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm
    return vec
  } catch {
    return null
  }
}

export async function embedNote(title: string, body: string, tags: string[]): Promise<Float32Array> {
  const local = localEmbed(title, body, tags)
  const remote = await remoteEmbed(`${title}\n\n${tags.join(' ')}\n\n${body}`)
  return remote ?? local
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}