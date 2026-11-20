import { allNotes, Note, Summary } from './store'
import { embedNote, tokenize } from './embed'

interface Entry {
  note: Note
  vector: Float32Array
  length: number
  terms: Map<string, number>
}

const entries = new Map<string, Entry>()

export const K1 = 1.2
export const B = 0.75

export async function rebuildIndex(): Promise<void> {
  entries.clear()
  const notes = await allNotes()
  for (const note of notes) await index(note)
}

export async function index(note: Note): Promise<void> {
  const body = `${note.title}\n\n${note.tags.join(' ')}\n\n${note.body}`
  const tokens = tokenize(body)
  const terms = new Map<string, number>()
  for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1)
  entries.set(note.id, {
    note,
    terms,
    length: tokens.length,
    vector: await embedNote(note.title, note.body, note.tags)
  })
}

export function drop(id: string): void {
  entries.delete(id)
}

export function get(id: string): Entry | undefined {
  return entries.get(id)
}

export function all(): Entry[] {
  return [...entries.values()]
}

export function avgLength(): number {
  if (!entries.size) return 1
  let total = 0
  for (const e of entries.values()) total += e.length
  return total / entries.size || 1
}

export function summaries(): Summary[] {
  return all()
    .map(({ note }) => ({
      id: note.id,
      title: note.title,
      tags: note.tags,
      updatedAt: note.updatedAt,
      clusterId: null
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}