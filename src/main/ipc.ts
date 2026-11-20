import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  allNotes,
  attachRoot,
  dataRoot,
  deriveTitle,
  newId,
  Note,
  readNote,
  removeNote,
  saveAttachment,
  writeNote
} from './store'
import { drop, index, rebuildIndex, summaries } from './index-db'
import { build, invalidate } from './cluster'
import { query } from './search'
import { settings, updateSettings, Settings } from './settings'
import { clipUrl } from './clip'

type GetWindow = () => BrowserWindow | null

function broadcast(getWindow: GetWindow): void {
  getWindow()?.webContents.send('graph:changed')
}

export function registerIpc(getWindow: GetWindow): void {
  ipcMain.handle('notes:summaries', () => summaries())

  ipcMain.handle('notes:get', async (_e, id: string) => readNote(id))

  ipcMain.handle('notes:create', async () => {
    const now = Date.now()
    const note: Note = {
      id: newId(),
      title: 'Untitled',
      body: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      attachments: [],
      source: null
    }
    await writeNote(note)
    await index(note)
    invalidate()
    broadcast(getWindow)
    return note
  })

  ipcMain.handle('notes:update', async (_e, id: string, patch: Partial<Note>) => {
    const existing = await readNote(id)
    if (!existing) return null
    const merged: Note = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    }
    if (patch.title !== undefined) {
      merged.title = patch.title.trim() ? patch.title.trim().slice(0, 160) : deriveTitle(merged.body, 'Untitled')
    } else if (patch.body !== undefined && !existing.title.trim()) {
      merged.title = deriveTitle(merged.body, 'Untitled')
    }
    await writeNote(merged)
    await index(merged)
    invalidate()
    broadcast(getWindow)
    return merged
  })

  ipcMain.handle('notes:delete', async (_e, id: string) => {
    await removeNote(id)
    drop(id)
    invalidate()
    broadcast(getWindow)
    return true
  })

  ipcMain.handle('graph:get', () => build())

  ipcMain.handle('search:query', (_e, text: string) => query(text))

  ipcMain.handle('search:ask', async (_e, text: string) => {
    const hits = query(text, 8)
    if (!hits.length) return { hits, answer: '', mode: 'empty' as const }

    const cfg = settings().llm
    const context = hits
      .slice(0, 6)
      .map((hit, i) => {
        const note = allNotesCache.get(hit.id)
        return `[${i + 1}] ${hit.title}\n${(note?.body ?? hit.excerpt).slice(0, 2200)}`
      })
      .join('\n\n---\n\n')

    if (!cfg.enabled || !cfg.model) {
      const answer = hits
        .slice(0, 4)
        .map((hit, i) => `**${hit.title}** — ${hit.excerpt} [${i + 1}]`)
        .join('\n\n')
      return { hits, answer, mode: 'local' as const }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 45000)
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You answer using ONLY the numbered notes provided. Cite with [n]. If the notes do not cover it, say so plainly in one line. Be concise, concrete, and keep the original explanations intact.'
            },
            { role: 'user', content: `Question: ${text}\n\nNotes:\n\n${context}` }
          ]
        }),
        signal: controller.signal
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const answer = json.choices?.[0]?.message?.content?.trim()
      if (!answer) throw new Error('empty')
      return { hits, answer, mode: 'llm' as const }
    } catch {
      const answer = hits
        .slice(0, 4)
        .map((hit, i) => `**${hit.title}** — ${hit.excerpt} [${i + 1}]`)
        .join('\n\n')
      return { hits, answer, mode: 'local-fallback' as const }
    }
  })

  ipcMain.handle('attachments:save', async (_e, name: string, bytes: ArrayBuffer) => {
    return saveAttachment(Buffer.from(bytes), name)
  })

  ipcMain.handle('clip:url', (_e, url: string) => clipUrl(url))

  ipcMain.handle('settings:get', () => settings())

  ipcMain.handle('settings:set', async (_e, patch: Partial<Settings>) => {
    const next = updateSettings(patch)
    invalidate()
    if (patch.embedding) await rebuildIndex()
    broadcast(getWindow)
    return next
  })

  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('app:revealData', () => shell.openPath(dataRoot()))

  ipcMain.handle('app:attachRoot', () => attachRoot())

  ipcMain.handle('app:resolve', (_e, rel: string) => path.join(attachRoot(), rel))
}

// Small cache so ask() does not re-read files for every hit.
export const allNotesCache = new Map<string, Note>()

export async function refreshNotesCache(): Promise<void> {
  allNotesCache.clear()
  for (const note of await allNotes()) allNotesCache.set(note.id, note)
}