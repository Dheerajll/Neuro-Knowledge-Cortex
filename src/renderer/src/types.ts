export interface Note {
  id: string
  title: string
  body: string
  tags: string[]
  createdAt: number
  updatedAt: number
  attachments: string[]
  source: { type: 'web'; url: string } | null
}

export interface Summary {
  id: string
  title: string
  tags: string[]
  updatedAt: number
  clusterId: string | null
}

export interface Hit extends Summary {
  score: number
  excerpt: string
}

export interface GraphNode {
  id: string
  title: string
  cluster: string
  group: string
  degree: number
  updatedAt: number
  tags: string[]
}

export interface Graph {
  nodes: GraphNode[]
  edges: { a: string; b: string; weight: number }[]
  clusters: { id: string; label: string; members: string[]; group: string }[]
  groups: { id: string; label: string; clusters: string[] }[]
  builtAt: number
}

export interface Settings {
  llm: { enabled: boolean; baseUrl: string; model: string; apiKey: string }
  embedding: { mode: 'local' | 'api'; baseUrl: string; model: string; apiKey: string }
  edgeThreshold: number
  minScore: number
}

export interface AskResult {
  hits: Hit[]
  answer: string
  mode: 'local' | 'llm' | 'local-fallback' | 'empty'
}