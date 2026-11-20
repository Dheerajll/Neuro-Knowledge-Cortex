import { all, avgLength, B, K1 } from './index-db'
import { tokenize } from './embed'
import { cosine } from './embed'
import { build } from './cluster'
import { settings } from './settings'
import { Summary } from './store'

export interface Hit {
  id: string
  title: string
  tags: string[]
  updatedAt: number
  score: number
  excerpt: string
}

function excerpt(body: string, terms: Set<string>): string {
  const sentences = body.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean)
  const scored = sentences.map((s) => {
    const tokens = tokenize(s)
    const overlap = tokens.filter((t) => terms.has(t)).length
    return { s, score: overlap / Math.sqrt(tokens.length || 1) }
  })
  scored.sort((a, b) => b.score - a.score)
  return (scored[0]?.s ?? sentences[0] ?? '').slice(0, 320)
}

export function query(text: string, limit = 24): Hit[] {
  const terms = tokenize(text)
  if (!terms.length) {
    return all()
      .sort((a, b) => b.note.updatedAt - a.note.updatedAt)
      .slice(0, limit)
      .map(({ note }) => ({
        id: note.id,
        title: note.title,
        tags: note.tags,
        updatedAt: note.updatedAt,
        score: 0,
        excerpt: excerpt(note.body, new Set())
      }))
  }

  const entries = all()
  const avg = avgLength()
  const docFreq = new Map<string, number>()
  for (const t of terms) {
    let n = 0
    for (const e of entries) if (e.terms.has(t)) n++
    docFreq.set(t, n)
  }

  const queryVec = new Float32Array(entries[0]?.vector.length ?? 256)
  for (const e of entries) {
    const v = e.vector
    for (let i = 0; i < Math.min(v.length, queryVec.length); i++) queryVec[i] += v[i]
  }
  let qn = 0
  for (let i = 0; i < queryVec.length; i++) qn += queryVec[i] * queryVec[i]
  qn = Math.sqrt(qn) || 1
  for (let i = 0; i < queryVec.length; i++) queryVec[i] /= qn

  const bm25 = new Map<string, number>()
  let maxBm = 0
  for (const e of entries) {
    let score = 0
    for (const t of terms) {
      const tf = e.terms.get(t)
      if (!tf) continue
      const df = docFreq.get(t) ?? 0
      const idf = Math.log(1 + (entries.length - df + 0.5) / (df + 0.5))
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (e.length / avg))))
    }
    if (score > 0) {
      bm25.set(e.note.id, score)
      maxBm = Math.max(maxBm, score)
    }
  }

  const termSet = new Set(terms)
  const graph = build()
  const adjacency = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, [])
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, [])
    adjacency.get(edge.a)!.push(edge.b)
    adjacency.get(edge.b)!.push(edge.a)
  }

  const vectorScore = new Map<string, number>()
  for (const e of entries) vectorScore.set(e.note.id, Math.max(0, cosine(queryVec, e.vector)))

  const prelim = entries
    .map((e) => {
      const lex = maxBm > 0 ? (bm25.get(e.note.id) ?? 0) / maxBm : 0
      return { id: e.note.id, score: lex * 0.5 + (vectorScore.get(e.note.id) ?? 0) * 0.5 }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)

  const boost = new Map<string, number>()
  for (const p of prelim.slice(0, 3)) {
    for (const neighbour of adjacency.get(p.id) ?? []) {
      boost.set(neighbour, Math.max(boost.get(neighbour) ?? 0, 0.12))
    }
  }

  const byId = new Map(entries.map((e) => [e.note.id, e]))
  const scored: Hit[] = []
  for (const e of entries) {
    const lex = maxBm > 0 ? (bm25.get(e.note.id) ?? 0) / maxBm : 0
    const vec = vectorScore.get(e.note.id) ?? 0
    const total = lex * 0.5 + vec * 0.5 + (boost.get(e.note.id) ?? 0)
    if (total < settings().minScore) continue
    scored.push({
      id: e.note.id,
      title: e.note.title,
      tags: e.note.tags,
      updatedAt: e.note.updatedAt,
      score: total,
      excerpt: excerpt(e.note.body, termSet)
    })
  }

  scored.sort((a, b) => b.score - a.score)
  void byId
  return scored.slice(0, limit)
}

export function neighboursOf(id: string, limit = 6): Summary[] {
  const graph = build()
  const related = graph.edges
    .filter((e) => e.a === id || e.b === id)
    .map((e) => ({ id: e.a === id ? e.b : e.a, weight: e.weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)

  return related
    .map(({ id: rid, weight }) => {
      const entry = all().find((e) => e.note.id === rid)
      if (!entry) return null
      return {
        id: entry.note.id,
        title: entry.note.title,
        tags: entry.note.tags,
        updatedAt: entry.note.updatedAt,
        clusterId: null,
        score: weight
      } as Summary & { score: number }
    })
    .filter(Boolean) as Summary[]
}