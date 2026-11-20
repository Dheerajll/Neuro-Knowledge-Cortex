import { useEffect, useRef, useState } from 'react'
import type { Graph } from '../types'

interface Props {
  graph: Graph
  activeId: string | null
  activeCluster: string | null
  onOpen: (id: string) => void
}

interface Particle {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  cluster: string
  title: string
  color: string
  fixed: boolean
}

export default function GraphCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particles = useRef<Particle[]>([])
  const dragging = useRef<{ p: Particle; moved: number } | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; title: string } | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    const dpr = window.devicePixelRatio || 1

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const clusterLabels = new Map(propsRef.current.graph.clusters.map((c) => [c.id, c.label]))
    const previous = new Map(particles.current.map((p) => [p.id, p]))
    const nodes = propsRef.current.graph.nodes.slice(0, 600)

    particles.current = nodes.map((node, index) => {
      const existing = previous.get(node.id)
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2
      const radius = Math.min(width, height) * 0.32 * (0.6 + ((index * 37) % 100) / 140)
      return {
        id: node.id,
        x: existing?.x ?? width / 2 + Math.cos(angle) * radius,
        y: existing?.y ?? height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        r: Math.min(11, 3.6 + node.degree * 1.5),
        cluster: node.cluster,
        title: node.title,
        color: node.color,
        fixed: existing?.fixed ?? false
      }
    })

    const byId = new Map(particles.current.map((p) => [p.id, p]))
    const edges = propsRef.current.graph.edges
      .map((e) => ({ a: byId.get(e.a), b: byId.get(e.b), w: e.weight }))
      .filter((e): e is { a: Particle; b: Particle; w: number } => !!e.a && !!e.b)

    let raf = 0
    const tick = (): void => {
      const centres = new Map<string, { x: number; y: number; n: number }>()
      for (const p of particles.current) {
        const c = centres.get(p.cluster) ?? { x: 0, y: 0, n: 0 }
        c.x += p.x
        c.y += p.y
        c.n++
        centres.set(p.cluster, c)
      }

      const list = particles.current
      for (let i = 0; i < list.length; i++) {
        const a = list[i]
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = (Math.random() - 0.5) * 2
            dy = (Math.random() - 0.5) * 2
            d2 = 4
          }
          if (d2 > 90000) continue
          const force = 1500 / d2
          const d = Math.sqrt(d2)
          const fx = (dx / d) * force
          const fy = (dy / d) * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }

        const c = centres.get(a.cluster)
        if (c && c.n > 1) {
          a.vx += ((c.x / c.n - a.x) / 240) * 1.05
          a.vy += ((c.y / c.n - a.y) / 240) * 1.05
        }

        a.vx += (width / 2 - a.x) / 2400
        a.vy += (height / 2 - a.y) / 2400
      }

      for (const e of edges) {
        const dx = e.b.x - e.a.x
        const dy = e.b.y - e.a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const k = 0.012 * e.w
        const fx = (dx / d) * (d - 62) * k
        const fy = (dy / d) * (d - 62) * k
        e.a.vx += fx
        e.a.vy += fy
        e.b.vx -= fx
        e.b.vy -= fy
      }

      for (const p of list) {
        if (p.fixed) {
          p.vx = 0
          p.vy = 0
          continue
        }
        p.vx *= 0.86
        p.vy *= 0.86
        p.x = Math.max(16, Math.min(width - 16, p.x + p.vx))
        p.y = Math.max(16, Math.min(height - 16, p.y + p.vy))
      }

      ctx.clearRect(0, 0, width, height)
      const active = propsRef.current.activeId
      const filter = propsRef.current.activeCluster

      for (const e of edges) {
        const dim = filter && e.a.cluster !== filter && e.b.cluster !== filter
        ctx.strokeStyle = dim ? 'rgba(120,112,96,0.1)' : `rgba(120,112,96,${0.16 + e.w * 0.4})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(e.a.x, e.a.y)
        ctx.lineTo(e.b.x, e.b.y)
        ctx.stroke()
      }

      ctx.textAlign = 'center'
      for (const [clusterId, centre] of centres) {
        const label = clusterLabels.get(clusterId)
        if (!label || centre.n < 2) continue
        const cx = centre.x / centre.n
        const cy = centre.y / centre.n
        const dim = filter && filter !== clusterId
        ctx.globalAlpha = dim ? 0.3 : 0.75
        ctx.font = '600 10px -apple-system, sans-serif'
        const text = label.length > 30 ? `${label.slice(0, 29)}…` : label
        const w = ctx.measureText(text).width + 14
        ctx.fillStyle = 'rgba(245,242,234,0.9)'
        ctx.beginPath()
        ctx.roundRect(cx - w / 2, cy - 30, w, 16, 8)
        ctx.fill()
        ctx.fillStyle = '#46433c'
        ctx.fillText(text, cx, cy - 18.5)
        ctx.globalAlpha = 1
      }

      for (const p of list) {
        const dim = filter && p.cluster !== filter
        ctx.globalAlpha = dim ? 0.22 : 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        if (p.id === active) {
          ctx.lineWidth = 2
          ctx.strokeStyle = '#191917'
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r + 3.5, 0, Math.PI * 2)
          ctx.stroke()
        }
        if (p.r > 7 && !dim) {
          ctx.fillStyle = 'rgba(25,25,23,0.72)'
          ctx.font = '11px -apple-system, sans-serif'
          ctx.fillText(p.title.slice(0, 26), p.x, p.y + p.r + 13)
        }
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const toLocal = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const nearest = (x: number, y: number): Particle | null => {
      let best: Particle | null = null
      let bestD = 18
      for (const p of particles.current) {
        const d = Math.hypot(p.x - x, p.y - y) - p.r
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      return best
    }

    const onDown = (event: PointerEvent): void => {
      const { x, y } = toLocal(event)
      const p = nearest(x, y)
      if (!p) return
      p.fixed = true
      dragging.current = { p, moved: 0 }
      canvas.classList.add('dragging')
      canvas.setPointerCapture(event.pointerId)
    }

    const onMove = (event: PointerEvent): void => {
      const { x, y } = toLocal(event)
      const drag = dragging.current
      if (drag) {
        drag.moved += 1
        drag.p.x = x
        drag.p.y = y
        return
      }
      const p = nearest(x, y)
      setTip(p ? { x: p.x, y: p.y, title: p.title } : null)
    }

    const onUp = (event: PointerEvent): void => {
      const drag = dragging.current
      if (!drag) return
      if (drag.moved < 4) propsRef.current.onOpen(drag.p.id)
      drag.p.fixed = false
      dragging.current = null
      canvas.classList.remove('dragging')
      canvas.releasePointerCapture(event.pointerId)
    }

    const onLeave = (): void => setTip(null)

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [props.graph])

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.title}
        </div>
      )}
      <div className="graph-legend">
        <b>{props.graph.nodes.length}</b> neurons · <b>{props.graph.edges.length}</b> links ·{' '}
        <b>{props.graph.clusters.length}</b> clusters · <b>{props.graph.groups.length}</b> domains
        <br />
        Click a neuron to open it. Drag to arrange.
      </div>
    </div>
  )
}