import type { AskResult, Graph, Hit, Note, Settings, Summary } from './types'

declare global {
  interface Window {
    neuron: {
      notes: {
        summaries: () => Promise<Summary[]>
        get: (id: string) => Promise<Note | null>
        create: () => Promise<Note>
        update: (id: string, patch: Partial<Note>) => Promise<Note | null>
        remove: (id: string) => Promise<boolean>
      }
      graph: { get: () => Promise<Graph> }
      search: {
        query: (text: string) => Promise<Hit[]>
        ask: (text: string) => Promise<AskResult>
      }
      attachments: { save: (name: string, bytes: ArrayBuffer) => Promise<string> }
      clip: (url: string) => Promise<{ title: string; markdown: string }>
      settings: { get: () => Promise<Settings>; set: (patch: Partial<Settings>) => Promise<Settings> }
      app: { openExternal: (url: string) => Promise<void>; revealData: () => Promise<void> }
      onGraphChanged: (cb: () => void) => () => void
    }
  }
}

export {}