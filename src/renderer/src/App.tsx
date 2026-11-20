import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Graph, Note, Settings, Summary } from './types'
import { api } from './lib/api'
import Sidebar from './components/Sidebar'
import GraphCanvas from './components/GraphCanvas'
import NoteEditor from './components/NoteEditor'
import AskPanel from './components/AskPanel'
import SettingsPanel from './components/Settings'

const EMPTY_GRAPH: Graph = { nodes: [], edges: [], clusters: [], groups: [], builtAt: 0 }

export default function App() {
  const [notes, setNotes] = useState<Summary[]>([])
  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH)
  const [note, setNote] = useState<Note | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeCluster, setActiveCluster] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Partial<Note>>({})

  const refresh = useCallback(async () => {
    const [list, nextGraph] = await Promise.all([api.notes.summaries(), api.graph.get()])
    setNotes(list)
    setGraph(nextGraph)
  }, [])

  useEffect(() => {
    api.settings.get().then(setSettings)
    refresh()
    const off = api.onGraphChanged(() => refresh())
    return off
  }, [refresh])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setAsking(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        create()
      }
      if (event.key === 'Escape') {
        if (asking) setAsking(false)
        else if (configuring) setConfiguring(false)
        else if (note) close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const flush = useCallback(async () => {
    if (!note || !Object.keys(pending.current).length) return
    const patch = pending.current
    pending.current = {}
    const updated = await api.notes.update(note.id, patch)
    if (updated) setNote((current) => (current && current.id === updated.id ? { ...current, ...updated } : current))
  }, [note])

  const change = (patch: Partial<Note>): void => {
    setNote((current) => (current ? { ...current, ...patch } : current))
    pending.current = { ...pending.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 550)
  }

  const open = async (id: string): Promise<void> => {
    await flush()
    const loaded = await api.notes.get(id)
    if (loaded) setNote(loaded)
  }

  const close = async (): Promise<void> => {
    await flush()
    setNote(null)
    setActiveCluster(null)
  }

  const create = async (): Promise<void> => {
    await flush()
    const created = await api.notes.create()
    setNote(created)
  }

  const remove = async (): Promise<void> => {
    if (!note) return
    if (!window.confirm(`Delete "${note.title}"?`)) return
    await api.notes.remove(note.id)
    setNote(null)
    refresh()
  }

  const related = useMemo(() => {
    if (!note) return []
    const ids = new Set(graph.edges.filter((e) => e.a === note.id || e.b === note.id).map((e) => (e.a === note.id ? e.b : e.a)))
    return graph.nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, title: n.title })).slice(0, 6)
  }, [graph, note])

  return (
    <div className="app">
      <Sidebar
        graph={graph}
        notes={notes}
        activeCluster={activeCluster}
        activeNoteId={note?.id ?? null}
        onCluster={setActiveCluster}
        onOpen={open}
        onNew={create}
        onAsk={() => setAsking(true)}
        onSettings={() => setConfiguring(true)}
      />

      <main className="main">
        <div className="topbar">
          <div className="search-field" onClick={() => setAsking(true)}>
            <span style={{ color: 'var(--ink-mute)' }}>⌕</span>
            <input
              readOnly
              placeholder="Search neurons, or ask a question"
              onFocus={() => setAsking(true)}
            />
            <span className="kbd">⌘K</span>
          </div>
          <span className="spacer" />
          <span className="status">
            {graph.nodes.length} neurons · {graph.clusters.length} clusters · {graph.groups.length} bases
          </span>
        </div>

        {note ? (
          <NoteEditor
            note={note}
            onChange={change}
            onClose={close}
            onDelete={remove}
            onOpenRelated={open}
            related={related}
          />
        ) : (
          <GraphCanvas graph={graph} activeId={null} activeCluster={activeCluster} onOpen={open} />
        )}
      </main>

      {asking && <AskPanel onOpen={open} onClose={() => setAsking(false)} />}
      {configuring && settings && (
        <SettingsPanel value={settings} onChange={setSettings} onClose={() => setConfiguring(false)} />
      )}
    </div>
  )
}