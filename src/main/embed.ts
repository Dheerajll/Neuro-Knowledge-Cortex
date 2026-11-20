import { settings } from './settings'

const DIM = 256

const STOP = new Set(
  `a an the and or but if then than that this these those of in on at to for from with without by as is are was were be been being it its into over under about after before between during
  i you he she we they me him her them my your our their not no do does did done have has had will would can could should may might must just also very more most some any each other such only own same so too s t`
    .split(/\s+/)
    .filter(Boolean)
)

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`*_#>\[\]()]/g, ' ')
    .split(/[^a-z0-9+#.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && t.length < 40 && !STOP.has(t))
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
  const bodyTokens = tokenize(body)

  for (const t of titleTokens) add(vec, t, 3)
  for (const t of tags.flatMap(tokenize)) add(vec, t, 2)
  for (const t of bodyTokens) add(vec, t, 1)

  const sequence = [...titleTokens, ...bodyTokens]
  for (let i = 0; i < sequence.length - 1; i++) add(vec, `${sequence[i]}_${sequence[i + 1]}`, 0.6)

  for (const t of sequence) {
    if (t.length < 5) continue
    const padded = `^${t}$`
    for (let i = 0; i < padded.length - 2; i++) add(vec, `#${padded.slice(i, i + 3)}`, 0.25)
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
    if (!raw || !raw.length) return null
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
  if (!remote) return local

  // Remote and local have different dimensions; keep a hybrid by projecting the
  // remote vector into the local space only when dimensions match, else use remote.
  return remote.length === DIM ? remote : remote
}

export function cosine(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < len; i++) dot += a[i] * b[i]
  return dot
}