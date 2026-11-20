import { useState } from 'react'
import type { Settings } from '../types'
import { api } from '../lib/api'

interface Props {
  value: Settings
  onChange: (next: Settings) => void
  onClose: () => void
}

export default function SettingsPanel(props: Props) {
  const [draft, setDraft] = useState<Settings>(props.value)

  const patch = (next: Partial<Settings>): void => setDraft((prev) => ({ ...prev, ...next }))

  const save = async (): Promise<void> => {
    const next = await api.settings.set(draft)
    props.onChange(next)
    props.onClose()
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="panel">
        <div className="panel-head">
          <strong style={{ flex: 1, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 15 }}>
            Settings
          </strong>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>

        <div className="settings-grid">
          <div className="h">Clustering</div>
          <div className="field">
            <label>Link threshold — {draft.edgeThreshold.toFixed(2)}</label>
            <input
              type="range"
              min={0.15}
              max={0.6}
              step={0.01}
              value={draft.edgeThreshold}
              onChange={(event) => patch({ edgeThreshold: Number(event.target.value) })}
            />
            <div className="hint">
              Lower links more notes together (broader clusters), higher keeps clusters tight.
            </div>
          </div>

          <div className="h">Embeddings</div>
          <div className="field">
            <label>Source</label>
            <select
              value={draft.embedding.mode}
              onChange={(event) =>
                patch({ embedding: { ...draft.embedding, mode: event.target.value as 'local' | 'api' } })
              }
            >
              <option value="local">Local (offline, no key)</option>
              <option value="api">OpenAI-compatible endpoint</option>
            </select>
            <div className="hint">
              Local is deterministic hashing — no downloads, works offline. An endpoint gives better
              semantic grouping if you have one.
            </div>
          </div>
          {draft.embedding.mode === 'api' && (
            <>
              <div className="field">
                <label>Base URL</label>
                <input
                  type="text"
                  value={draft.embedding.baseUrl}
                  onChange={(event) => patch({ embedding: { ...draft.embedding, baseUrl: event.target.value } })}
                />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Model</label>
                  <input
                    type="text"
                    value={draft.embedding.model}
                    onChange={(event) => patch({ embedding: { ...draft.embedding, model: event.target.value } })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Key</label>
                  <input
                    type="password"
                    value={draft.embedding.apiKey}
                    onChange={(event) => patch({ embedding: { ...draft.embedding, apiKey: event.target.value } })}
                  />
                </div>
              </div>
            </>
          )}

          <div className="h">Answers</div>
          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.llm.enabled}
                onChange={(event) => patch({ llm: { ...draft.llm, enabled: event.target.checked } })}
              />
              Synthesize answers with a model
            </label>
            <div className="hint">
              Off: ask returns the matching notes verbatim. On: answers are written from your notes with citations.
            </div>
          </div>
          {draft.llm.enabled && (
            <>
              <div className="field">
                <label>Base URL</label>
                <input
                  type="text"
                  value={draft.llm.baseUrl}
                  onChange={(event) => patch({ llm: { ...draft.llm, baseUrl: event.target.value } })}
                />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Model</label>
                  <input
                    type="text"
                    placeholder="e.g. a chat model id"
                    value={draft.llm.model}
                    onChange={(event) => patch({ llm: { ...draft.llm, model: event.target.value } })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Key</label>
                  <input
                    type="password"
                    value={draft.llm.apiKey}
                    onChange={(event) => patch({ llm: { ...draft.llm, apiKey: event.target.value } })}
                  />
                </div>
              </div>
            </>
          )}

          <div className="h">Storage</div>
          <div className="row">
            <button className="btn" onClick={() => api.app.revealData()}>
              Reveal data folder
            </button>
            <span className="hint">Plain JSON files. Copy the folder to back up.</span>
          </div>
        </div>
      </div>
    </div>
  )
}