import { app } from 'electron'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

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

let root = ''

export function dataRoot(): string {
  if (!root) root = path.join(app.getPath('userData'), 'neuron')
  return root
}

export const notesDir = (): string => path.join(dataRoot(), 'notes')
export const attachRoot = (): string => path.join(dataRoot(), 'attachments')

export async function ensureDirs(): Promise<void> {
  await fsp.mkdir(notesDir(), { recursive: true })
  await fsp.mkdir(attachRoot(), { recursive: true })
}

export function newId(): string {
  return crypto.randomUUID()
}

function notePath(id: string): string {
  return path.join(notesDir(), `${id}.json`)
}

function slug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'note'
  )
}

export function deriveTitle(body: string, fallback: string): string {
  const heading = body.match(/^#{1,6}\s+(.+)$/m)
  if (heading) return heading[1].trim().slice(0, 120)
  const firstLine = body.split('\n').find((line) => line.trim().length > 0)
  if (firstLine) return firstLine.replace(/[*_`>#-]/g, '').trim().slice(0, 90) || fallback
  return fallback
}

export async function readNote(id: string): Promise<Note | null> {
  try {
    const raw = await fsp.readFile(notePath(id), 'utf8')
    return JSON.parse(raw) as Note
  } catch {
    return null
  }
}

export async function writeNote(note: Note): Promise<void> {
  const target = notePath(note.id)
  const tmp = `${target}.${process.pid}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(note, null, 2), 'utf8')
  await fsp.rename(tmp, target)
}

export async function removeNote(id: string): Promise<void> {
  try {
    await fsp.unlink(notePath(id))
  } catch {
    /* already gone */
  }
}

export async function allNotes(): Promise<Note[]> {
  let entries: string[] = []
  try {
    entries = await fsp.readdir(notesDir())
  } catch {
    return []
  }
  const notes: Note[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const note = await readNote(entry.slice(0, -5))
    if (note && typeof note.id === 'string') notes.push(note)
  }
  return notes
}

export async function saveAttachment(bytes: Buffer, filename: string): Promise<string> {
  const ext = (path.extname(filename) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '')
  const name = `${Date.now()}-${slug(path.basename(filename, path.extname(filename)))}${ext}`
  await fsp.writeFile(path.join(attachRoot(), name), bytes)
  return name
}

export async function pruneOrphans(keep: Set<string>): Promise<void> {
  let entries: string[] = []
  try {
    entries = await fsp.readdir(attachRoot())
  } catch {
    return
  }
  for (const entry of entries) {
    if (!keep.has(entry)) {
      await fsp.unlink(path.join(attachRoot(), entry)).catch(() => undefined)
    }
  }
}