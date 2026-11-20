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
  fixed: boolean
}

const PALETTE = ['#a4502b', '#4d6350', '#6a5b8a', '#8a6a2f', '#3f6b78', '#8a4457', '#5a6a3d', '#7a5a3a']

function colour(cluster: string): string {
  let h = 0
  for (let i = 0; i < cluster.length; i++) h = (h * 31 + cluster.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function GraphCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particles = useRef<Particle[]>([])
  const dragging = useRef<{ p: Particle; moved: number } | null>(null)
  const hover = useRef<Particle | null>(null)
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

    // seed particles, keeping positions for nodes that persist
    const previous = new Map(particles.current.map((p) => [p.id, p]))
    const nodes = propsRef.current.graph.nodes.slice(0, 600)
    particles.current = nodes.map((node, i) => {
      const existing = previous.get(node.id)
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
      const radius = Math.min(width, height) * 0.32 * (0.6 + ((i * 37) % 100) / 140)
      return {
        id: node.id,
        x: existing?.x ?? width / 2 + Math.cos(angle) * radius,
        y: existing?.y ?? height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        r: Math.min(11, 3.6 + node.degree * 1.5),
        cluster: node.cluster,
        title: node.title,
        fixed: existing?.fixed ?? false
      }
    })

    const byId = new Map(particles.current.map((p) => [p.id, p]))
    const edges = propsRef.current.graph.edges
      .map((e) => ({ a: byId.get(e.a), b: byId.get(e.b), w: e.weight }))
      .filter((e): e is { a: Particle; b: Particle; w: number } => !!e.a && !!e.b)

    let frame = 0
    const tick = (): void => {
      frame++

      // cluster centroids for cohesion
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
          a.vx += ((c.x / c.n - a.x) / 260) * 0.9
          a.vy += ((c.y / c.n - a.y) / 260) * 0.9
        }

        a.vx += (width / 2 - a.x) / 2400
        a.vy += (height / 2 - a.y) / 2400
      }

      for (const e of edges) {
        const dx = e.b.x - e.a.x
        const dy = e.b.y - e.a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const target = 62
        const k = 0.012 * e.w
        const fx = (dx / d) * (d - target) * k
        const fy = (dy / d) * (d - target) * k
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

      // draw
      ctx.clearRect(0, 0, width, height)
      const active = propsRef.current.activeId
      const filter = propsRef.current.activeCluster

      ctx.lineWidth = 1
      for (const e of edges) {
        const dim = filter && e.a.cluster !== filter && e.b.cluster !== filter
        ctx.strokeStyle = `rgba(120,112,96,${dim ? 0.1 : 0.16 + e.w * 0.4})`
        ctx.beginPath()
        ctx.moveTo(e.a.x, e.a.y)
        ctx.lineTo(e.b.x, e.b.y)
        ctx.stroke()
      }

      for (const p of list) {
        const dim = filter && p.cluster !== filter
        const base = colour(p.cluster)
        ctx.globalAlpha = dim ? 0.22 : 1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = base
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
          ctx.textAlign = 'center'
          ctx.fillText(p.title.slice(0, 26), p.x, p.y + p.r + 13)
        }
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(tick)
    }

    let raf = requestAnimationFrame(tick)

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
      if (p) {
        p.fixed = true
        dragging.current = { p, moved: 0 }
        canvas.classList.add('dragging')
        canvas.setPointerCapture(event.pointerId)
      }
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
      hover.current = p
      setTip(p ? { x: p.x, y: p.y, title: p.title } : null)
    }

    const onUp = (event: PointerEvent): void => {
      const drag = dragging.current
      if (drag) {
        if (drag.moved < 4) {
          propsRef.current.onOpen(drag.p.id)
        }
        drag.p.fixed = false
        dragging.current = null
        canvas.classList.remove('dragging')
        canvas.releasePointerCapture(event.pointerId)
      }
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

  const nodeCount = props.graph.nodes.length

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
          {tip.title}
        </div>
      )}
      <div className="graph-legend">
        <b>{nodeCount}</b> neurons · <b>{props.graph.edges.length}</b> links · <b>{props.graph.clusters.length}</b> clusters
        <br />
        Click a neuron to open it. Drag to arrange.
      </div>
    </div>
  )
}