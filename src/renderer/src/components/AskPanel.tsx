import { useEffect, useRef, useState } from 'react'
import type { AskResult, Hit } from '../types'
import { api } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'

interface Props {
  onOpen: (id: string) => void
  onClose: () => void
}

export default function AskPanel(props: Props) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [result, setResult] = useState<AskResult | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    if (!text.trim()) {
      setHits([])
      setResult(null)
      return
    }
    const timer = setTimeout(async () => {
      setHits(await api.search.query(text))
    }, 140)
    return () => clearTimeout(timer)
  }, [text])

  const submit = async (): Promise<void> => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      setResult(await api.search.ask(text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className="panel" onKeyDown={(event) => event.key === 'Escape' && props.onClose()}>
        <div className="panel-head">
          <span style={{ color: 'var(--clay)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>ask</span>
          <input
            ref={input}
            value={text}
            placeholder="What do you want to recall?"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
          />
          <button className="btn" onClick={submit} disabled={busy}>
            {busy ? '…' : 'Ask'}
          </button>
        </div>

        {result && result.answer && (
          <div className="answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.answer) }} />
        )}

        <div className="panel-body">
          {(result?.hits ?? hits).map((hit, index) => (
            <button
              key={hit.id}
              className="result"
              onClick={() => {
                props.onOpen(hit.id)
                props.onClose()
              }}
            >
              <div className="rt">
                {index + 1}. {hit.title}
              </div>
              <div className="rx">{hit.excerpt}</div>
            </button>
          ))}
          {!hits.length && !result && text.trim() && (
            <div className="empty-hint">No matching neurons yet.</div>
          )}
        </div>

        <div className="panel-foot">
          <span>{result ? `mode: ${result.mode}` : 'type to search, Enter to ask'}</span>
          <span>Esc closes</span>
        </div>
      </div>
    </div>
  )
}