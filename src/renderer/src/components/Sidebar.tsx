import type { Graph, Summary } from '../types'

interface Props {
  graph: Graph
  notes: Summary[]
  activeCluster: string | null
  activeNoteId: string | null
  onCluster: (id: string | null) => void
  onOpen: (id: string) => void
  onNew: () => void
  onAsk: () => void
  onSettings: () => void
}

export default function Sidebar(props: Props) {
  const { graph, notes } = props

  const visible = props.activeCluster
    ? notes.filter((n) => graph.clusters.find((c) => c.id === props.activeCluster)?.members.includes(n.id))
    : notes.slice(0, 40)

  return (
    <aside className="sidebar">
      <div className="drag-strip">Neuron</div>
      <div className="side-actions">
        <button className="btn primary" onClick={props.onNew}>
          New note
        </button>
        <button className="btn" onClick={props.onAsk}>
          Ask
        </button>
        <button className="btn ghost" onClick={props.onSettings} title="Settings">
          ⚙
        </button>
      </div>

      <div className="side-scroll">
        <div className="side-label">
          <span>Knowledge base</span>
          <button
            className="btn ghost"
            style={{ padding: '0 4px', fontSize: 11 }}
            onClick={() => props.onCluster(null)}
          >
            all
          </button>
        </div>

        {!graph.nodes.length && <div className="empty-hint">Nothing yet. Write a note and it becomes a neuron.</div>}

        {graph.groups.map((group) => {
          const members = graph.clusters
            .filter((c) => group.clusters.includes(c.id))
            .sort((a, b) => b.members.length - a.members.length)
          if (!members.length) return null
          const total = members.reduce((sum, c) => sum + c.members.length, 0)
          return (
            <div key={group.id} style={{ ['--group-hue' as string]: group.hue }}>
              <div className="group-head" style={{ color: group.hue }}>
                <span className="group-glyph">{group.glyph}</span>
                {group.label}
                <span className="group-count">{total}</span>
              </div>
              {members.map((cluster) => (
                <button
                  key={cluster.id}
                  className={`cluster ${props.activeCluster === cluster.id ? 'active' : ''}`}
                  onClick={() => props.onCluster(cluster.id === props.activeCluster ? null : cluster.id)}
                  style={{ ['--cluster-color' as string]: cluster.color }}
                >
                  <span className="cluster-dot" />
                  <span>{cluster.label}</span>
                  <span className="count">{cluster.members.length}</span>
                </button>
              ))}
            </div>
          )
        })}

        <div className="side-label">
          <span>{props.activeCluster ? 'In cluster' : 'Recent'}</span>
        </div>

        {visible.map((note) => (
          <button
            key={note.id}
            className={`note-row ${props.activeNoteId === note.id ? 'active' : ''}`}
            onClick={() => props.onOpen(note.id)}
          >
            <span className="t">{note.title}</span>
            {note.tags.length > 0 && <span className="m">{note.tags.join(' · ')}</span>}
          </button>
        ))}
      </div>
    </aside>
  )
}