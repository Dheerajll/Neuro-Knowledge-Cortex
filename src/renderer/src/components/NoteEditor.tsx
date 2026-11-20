import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note } from '../types'
import { renderMarkdown } from '../lib/markdown'
import { api } from '../lib/api'

interface Props {
  note: Note
  onChange: (patch: Partial<Note>) => void
  onClose: () => void
  onDelete: () => void
  onOpenRelated: (id: string) => void
  related: { id: string; title: string }[]
}

export default function NoteEditor(props: Props) {
  const { note } = props
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const [split, setSplit] = useState(true)
  const [preview, setPreview] = useState(false)
  const [tagDraft, setTagDraft] = useState(note.tags.join(', '))
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    setTagDraft(note.tags.join(', '))
    setSaved(true)
  }, [note.id])

  const html = useMemo(() => (preview || split ? renderMarkdown(note.body) : ''), [note.body, preview, split])

  const insert = (before: string, after = '', placeholder = ''): void => {
    const el = textarea.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = note.body.slice(start, end) || placeholder
    const next = note.body.slice(0, start) + before + selected + after + note.body.slice(end)
    props.onChange({ body: next })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const onBody = (value: string): void => {
    setSaved(false)
    props.onChange({ body: value })
  }

  const commitTags = (): void => {
    const tags = tagDraft
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12)
    props.onChange({ tags })
  }

  const attach = async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    let body = note.body
    for (const file of list) {
      const bytes = await file.arrayBuffer()
      const rel = await api.attachments.save(file.name || 'image.png', bytes)
      body += `\n\n![${file.name || 'image'}](neuron://attach/${rel})\n`
    }
    props.onChange({ body })
  }

  const link = (): void => {
    const url = window.prompt('Link URL')
    if (!url) return
    insert('[', `](${url})`, 'text')
  }

  const clip = async (): Promise<void> => {
    const url = window.prompt('Clip a web page into this note — URL')
    if (!url) return
    try {
      const { markdown } = await api.clip(url)
      props.onChange({ body: `${note.body}\n\n${markdown}` })
    } catch (error) {
      window.alert(`Could not clip that page: ${(error as Error).message}`)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Tab') {
      event.preventDefault()
      insert('  ')
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      setSaved(true)
    }
    if (event.key === 's' && event.metaKey) {
      event.preventDefault()
      setSaved(true)
    }
  }

  return (
    <div
      className="editor"
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault()
          attach(event.dataTransfer.files)
        }
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="editor-head">
        <input
          className="title-input"
          value={note.title}
          placeholder="Untitled"
          onChange={(event) => props.onChange({ title: event.target.value })}
        />
        <div className="meta-row">
          <input
            className="tag-input"
            value={tagDraft}
            placeholder="tags, comma separated"
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitTags()
            }}
          />
          <div className="tag-chips">
            {note.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar">
        <button onClick={() => insert('**', '**', 'bold')} title="Bold">
          <b>B</b>
        </button>
        <button onClick={() => insert('_', '_', 'italic')} title="Italic">
          <i>I</i>
        </button>
        <button onClick={() => insert('`', '`', 'code')} title="Inline code">
          {'<>'}
        </button>
        <span className="sep" />
        <button onClick={() => insert('## ')} title="Heading">
          H
        </button>
        <button onClick={() => insert('- ')} title="List">
          •
        </button>
        <button
          onClick={() => insert('\n| Column | Column |\n| --- | --- |\n| cell | cell |\n')}
          title="Table"
        >
          ▦
        </button>
        <button onClick={() => insert('\n$$\n', '\n$$\n', 'x^2')} title="Equation">
          ∑
        </button>
        <span className="sep" />
        <button onClick={link} title="Link">
          ↗
        </button>
        <button onClick={clip} title="Clip web page">
          ✂
        </button>
        <label className="btn ghost" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          ⬒
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => event.target.files && attach(event.target.files)}
          />
        </label>
        <span className="sep" />
        <button onClick={() => { setSplit((v) => !v); setPreview(false) }} title="Toggle split view">
          {split ? '▤' : '▥'}
        </button>
        <button onClick={() => setPreview((v) => !v)} title="Toggle preview only">
          {preview ? '✎' : '👁'}
        </button>
        <span className="spacer" />
        <span className="status">{saved ? 'saved' : 'editing'}</span>
        <button className="btn ghost danger" onClick={props.onDelete} title="Delete note">
          Delete
        </button>
        <button className="btn ghost" onClick={props.onClose}>
          Close
        </button>
      </div>

      <div className={`editor-body ${split && !preview ? 'split' : ''}`}>
        {!preview && (
          <textarea
            ref={textarea}
            value={note.body}
            spellCheck
            placeholder={'Explain it plainly. What is it, how does it work, when would you use it…'}
            onChange={(event) => onBody(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length) {
                event.preventDefault()
                attach(files)
              }
            }}
          />
        )}
        {(preview || split) && <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>

      {props.related.length > 0 && (
        <div className="panel-foot" style={{ borderTop: '1px solid var(--line)' }}>
          <span>Connected</span>
          <span className="row">
            {props.related.map((r) => (
              <button key={r.id} className="btn ghost" style={{ fontSize: 11 }} onClick={() => props.onOpenRelated(r.id)}>
                {r.title.slice(0, 30)}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}