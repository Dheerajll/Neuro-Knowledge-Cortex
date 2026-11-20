import { all, avgLength } from './index-db'
import { cosine } from './embed'
import { tokenize } from './embed'
import { settings } from './settings'

export interface GraphNode {
  id: string
  title: string
  cluster: string
  group: string
  degree: number
  updatedAt: number
  tags: string[]
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
}

export interface Graph {
  nodes: GraphNode[]
  edges: Edge[]
  clusters: Bucket[]
  groups: { id: string; label: string; clusters: string[] }[]
  builtAt: number
}

let cache: Graph | null = null
let dirty = true

export function invalidate(): void {
  dirty = true
  cache = null
}

function centroid(vectors: Float32Array[]): Float32Array {
  const dim = vectors[0].length
  const out = new Float32Array(dim)
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i]
  let norm = 0
  for (let i = 0; i < dim; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < dim; i++) out[i] /= norm
  return out
}

function labelFor(members: string[]): string {
  const counts = new Map<string, number>()
  for (const id of members) {
    const entry = all().find((e) => e.note.id === id)
    if (!entry) continue
    for (const t of new Set(tokenize(`${entry.note.title} ${entry.note.tags.join(' ')} ${entry.note.body.slice(0, 800)}`))) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  const top = ranked.slice(0, 2).map(([t]) => t)
  if (!top.length) return 'Untitled cluster'
  return top.join(' · ')
}

export function build(): Graph {
  if (!dirty && cache) return cache

  const entries = all()
  const ids = entries.map((e) => e.note.id)
  const vectors = new Map(entries.map((e) => [e.note.id, e.vector]))
  const threshold = settings().edgeThreshold
  const k = 5

  const edges: Edge[] = []
  const seen = new Set<string>()

  for (const source of ids) {
    const sv = vectors.get(source)!
    const scored: { id: string; sim: number }[] = []
    for (const target of ids) {
      if (target === source) continue
      const sim = cosine(sv, vectors.get(target)!)
      if (sim >= threshold) scored.push({ id: target, sim })
    }
    scored.sort((a, b) => b.sim - a.sim)
    for (const { id: target, sim } of scored.slice(0, k)) {
      const key = source < target ? `${source}|${target}` : `${target}|${source}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ a: source, b: target, weight: sim })
    }
  }

  // Label propagation over the edge graph.
  const neighbours = new Map<string, { id: string; weight: number }[]>()
  for (const id of ids) neighbours.set(id, [])
  for (const e of edges) {
    neighbours.get(e.a)!.push({ id: e.b, weight: e.weight })
    neighbours.get(e.b)!.push({ id: e.a, weight: e.weight })
  }

  const label = new Map<string, string>(ids.map((id) => [id, id]))
  for (let round = 0; round < 12; round++) {
    let changed = 0
    for (const id of ids) {
      const scores = new Map<string, number>()
      for (const n of neighbours.get(id)!) {
        const l = label.get(n.id)!
        scores.set(l, (scores.get(l) ?? 0) + n.weight)
      }
      if (!scores.size) continue
      const best = [...scores.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]
      if (best[0] !== label.get(id)) {
        label.set(id, best[0])
        changed++
      }
    }
    if (!changed) break
  }

  const byLabel = new Map<string, string[]>()
  for (const id of ids) {
    const l = label.get(id)!
    if (!byLabel.has(l)) byLabel.set(l, [])
    byLabel.get(l)!.push(id)
  }

  // Agglomerate clusters into knowledge-base groups via centroid similarity.
  const bucketIds = [...byLabel.keys()].sort()
  const centroids = new Map(
    bucketIds.map((b) => [b, centroid(byLabel.get(b)!.map((id) => vectors.get(id)!))])
  )
  const groupOf = new Map<string, string>(bucketIds.map((b) => [b, b]))
  for (let round = 0; round < 6; round++) {
    let changed = 0
    for (const b of bucketIds) {
      const scores = new Map<string, number>()
      for (const other of bucketIds) {
        if (other === b) continue
        const sim = cosine(centroids.get(b)!, centroids.get(other)!)
        if (sim < threshold * 0.6) continue
        const g = groupOf.get(other)!
        scores.set(g, (scores.get(g) ?? 0) + sim)
      }
      if (!scores.size) continue
      const best = [...scores.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]
      if (best[0] !== groupOf.get(b)) {
        groupOf.set(b, best[0])
        changed++
      }
    }
    if (!changed) break
  }

  const degree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }

  const nodes: GraphNode[] = entries.map((e) => ({
    id: e.note.id,
    title: e.note.title,
    cluster: label.get(e.note.id)!,
    group: groupOf.get(label.get(e.note.id)!)!,
    degree: degree.get(e.note.id) ?? 0,
    updatedAt: e.note.updatedAt,
    tags: e.note.tags
  }))

  const clusters: Bucket[] = bucketIds.map((b) => ({
    id: b,
    label: labelFor(byLabel.get(b)!),
    members: byLabel.get(b)!,
    group: groupOf.get(b)!
  }))

  const groupMap = new Map<string, string[]>()
  for (const c of clusters) {
    if (!groupMap.has(c.group)) groupMap.set(c.group, [])
    groupMap.get(c.group)!.push(c.id)
  }

  const groups = [...groupMap.entries()]
    .map(([id, clusterIds]) => ({
      id,
      clusters: clusterIds,
      label: labelFor(clusterIds.flatMap((cid) => clusters.find((c) => c.id === cid)!.members))
    }))
    .sort((a, b) => b.clusters.length - a.clusters.length)

  cache = { nodes, edges, clusters, groups, builtAt: Date.now() }
  dirty = false
  return cache
}

export { avgLength }