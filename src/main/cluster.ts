import { all } from './index-db'
import { cosine } from './embed'
import { tokenize } from './embed'
import { settings } from './settings'
import { DOMAINS, DOMAIN_BY_ID, NAMES } from './lexicon'

export interface GraphNode {
  id: string
  title: string
  cluster: string
  group: string
  degree: number
  updatedAt: number
  tags: string[]
  color: string
}

export interface Edge {
  a: string
  b: string
  weight: number
}

export interface Bucket {
  id: string
  label: string
  members: string[]
  group: string
  color: string
}

export interface Group {
  id: string
  label: string
  short: string
  hue: string
  glyph: string
  clusters: string[]
}

export interface Graph {
  nodes: GraphNode[]
  edges: Edge[]
  clusters: Bucket[]
  groups: Group[]
  builtAt: number
}

let cache: Graph | null = null
let dirty = true

export function invalidate(): void {
  dirty = true
  cache = null
}

function display(term: string): string {
  return NAMES[term] ?? term.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function weightedTerms(title: string, tags: string[], body: string): Map<string, number> {
  const terms = new Map<string, number>()
  const bump = (list: string[], weight: number): void => {
    for (const term of list) terms.set(term, (terms.get(term) ?? 0) + weight)
  }
  bump(tokenize(title), 3)
  bump(tags.flatMap(tokenize), 2)
  bump(tokenize(body.slice(0, 1200)), 1)
  return terms
}

function nameBucket(members: string[], lookup: Map<string, ReturnType<typeof all>[number]>): string {
  const aggregate = new Map<string, number>()
  for (const id of members) {
    const entry = lookup.get(id)
    if (!entry) continue
    const note = entry.note
    for (const [term, weight] of weightedTerms(note.title, note.tags, note.body)) {
      aggregate.set(term, (aggregate.get(term) ?? 0) + weight)
    }
  }
  const ranked = [...aggregate.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!ranked.length) {
    const entry = lookup.get(members[0])
    return entry ? truncate(entry.note.title, 26) : 'Cluster'
  }

  let label = display(ranked[0][0])
  const top = ranked[0][1]
  for (let i = 1; i < ranked.length && i < 6; i++) {
    const candidate = display(ranked[i][0])
    if (ranked[i][1] >= top * 0.42 && candidate !== label) {
      label += ` · ${candidate}`
      break
    }
  }
  return truncate(label, 34)
}

function domainOf(members: string[], lookup: Map<string, ReturnType<typeof all>[number]>): string {
  const scores = new Map<string, number>()
  for (const id of members) {
    const entry = lookup.get(id)
    if (!entry) continue
    const note = entry.note
    const titleTerms = tokenize(`${note.title} ${note.tags.join(' ')}`)
    const bodyTerms = tokenize(note.body.slice(0, 1200))
    for (const domain of DOMAINS) {
      if (!domain.lex.size) continue
      let score = 0
      for (const term of titleTerms) if (domain.lex.has(term)) score += 3
      for (const term of bodyTerms) if (domain.lex.has(term)) score += 1
      if (score) scores.set(domain.id, (scores.get(domain.id) ?? 0) + score)
    }
  }
  let best = 'frontier'
  let bestScore = 2.5
  for (const [id, score] of scores) {
    if (score > bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

function centroidOf(vectors: Float32Array[]): Float32Array {
  const dim = vectors[0]?.length ?? 0
  const out = new Float32Array(dim)
  for (const vector of vectors) for (let i = 0; i < dim; i++) out[i] += vector[i]
  let norm = 0
  for (let i = 0; i < dim; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < dim; i++) out[i] /= norm
  return out
}

export function build(): Graph {
  if (!dirty && cache) return cache

  const entries = all()
  const lookup = new Map(entries.map((entry) => [entry.note.id, entry]))
  const ids = entries.map((entry) => entry.note.id)
  const vectors = new Map(entries.map((entry) => [entry.note.id, entry.vector]))
  const threshold = settings().edgeThreshold
  const neighbours = 5

  const edges: Edge[] = []
  const seen = new Set<string>()

  for (const source of ids) {
    const vector = vectors.get(source)!
    const scored: { id: string; sim: number }[] = []
    for (const target of ids) {
      if (target === source) continue
      const sim = cosine(vector, vectors.get(target)!)
      if (sim >= threshold) scored.push({ id: target, sim })
    }
    scored.sort((a, b) => b.sim - a.sim)
    for (const { id: target, sim } of scored.slice(0, neighbours)) {
      const key = source < target ? `${source}|${target}` : `${target}|${source}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a: source, b: target, weight: sim })
    }
  }

  const adjacency = new Map<string, { id: string; weight: number }[]>(ids.map((id) => [id, []]))
  for (const edge of edges) {
    adjacency.get(edge.a)!.push({ id: edge.b, weight: edge.weight })
    adjacency.get(edge.b)!.push({ id: edge.a, weight: edge.weight })
  }

  const label = new Map<string, string>(ids.map((id) => [id, id]))
  for (let round = 0; round < 12; round++) {
    let changed = 0
    for (const id of ids) {
      const scores = new Map<string, number>()
      for (const neighbour of adjacency.get(id)!) {
        const current = label.get(neighbour.id)!
        scores.set(current, (scores.get(current) ?? 0) + neighbour.weight)
      }
      if (!scores.size) continue
      const best = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      if (best[0] !== label.get(id)) {
        label.set(id, best[0])
        changed++
      }
    }
    if (!changed) break
  }

  const byLabel = new Map<string, string[]>()
  for (const id of ids) {
    const current = label.get(id)!
    if (!byLabel.has(current)) byLabel.set(current, [])
    byLabel.get(current)!.push(id)
  }

  const order = new Map(DOMAINS.map((domain, index) => [domain.id, index]))

  const clusters: Bucket[] = [...byLabel.entries()].map(([bucketId, members]) => {
    const group = domainOf(members, lookup)
    return {
      id: `c${bucketId.slice(0, 8)}`,
      label: nameBucket(members, lookup),
      members,
      group,
      color: DOMAIN_BY_ID[group].tints[members.length % 2]
    }
  })

  clusters.sort((a, b) => {
    const da = order.get(a.group) ?? 99
    const db = order.get(b.group) ?? 99
    return da - db || b.members.length - a.members.length || a.label.localeCompare(b.label)
  })

  const clusterOf = new Map<string, Bucket>()
  for (const cluster of clusters) for (const id of cluster.members) clusterOf.set(id, cluster)

  const degree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1)
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1)
  }

  const nodes: GraphNode[] = entries.map((entry) => {
    const cluster = clusterOf.get(entry.note.id)!
    return {
      id: entry.note.id,
      title: entry.note.title,
      cluster: cluster.id,
      group: cluster.group,
      degree: degree.get(entry.note.id) ?? 0,
      updatedAt: entry.note.updatedAt,
      tags: entry.note.tags,
      color: cluster.color
    }
  })

  const groupMap = new Map<string, string[]>()
  for (const cluster of clusters) {
    if (!groupMap.has(cluster.group)) groupMap.set(cluster.group, [])
    groupMap.get(cluster.group)!.push(cluster.id)
  }

  const groups: Group[] = [...groupMap.entries()]
    .map(([id, clusterIds]) => {
      const domain = DOMAIN_BY_ID[id] ?? DOMAIN_BY_ID.frontier
      return { id, label: domain.label, short: domain.short, hue: domain.tints[0], glyph: domain.glyph, clusters: clusterIds }
    })
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))

  cache = { nodes, edges, clusters, groups, builtAt: Date.now() }
  dirty = false
  return cache
}