import { useRef, useEffect, useCallback, useState } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import type { Simulation, LinkObject } from 'd3-force'
import { GraphData, GraphNode } from '../lib/graphData'
import { SOCIAL_ORIGIN } from '../lib/origins'

interface GraphVizProps {
  data: GraphData
  className?: string
}

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
  id: string
}

interface SimEdge extends LinkObject<SimNode> {
  source: string | SimNode
  target: string | SimNode
}

export default function GraphViz({ data, className }: GraphVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<Simulation<SimNode> | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  const handleNodeClick = useCallback((node: GraphNode) => {
    window.open(`${SOCIAL_ORIGIN}/u/${encodeURIComponent(node.username)}`, '_blank')
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.nodes.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Build simulation nodes
    const nodes: SimNode[] = data.nodes.map(n => ({
      ...n,
      id: n.username,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }))

    const links: SimEdge[] = data.edges.map(e => ({
      source: e.source as string | SimNode,
      target: e.target as string | SimNode,
    }))

    const width = container.clientWidth
    const height = container.clientHeight
    canvas.width = width * devicePixelRatio
    canvas.height = height * devicePixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(devicePixelRatio, devicePixelRatio)

    const sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink(links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>(d => getNodeRadius(d.followersCount)).padding(8))

    simRef.current = sim

    // Zoom state
    let zoomX = 0, zoomY = 0, zoomK = 1
    let dragging: SimNode | null = null
    let dragStartX = 0, dragStartY = 0
    let isPanning = false
    let panStartX = 0, panStartY = 0

    const tick = () => {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.translate(zoomX, zoomY)
      ctx.scale(zoomK, zoomK)

      // Draw edges
      ctx.strokeStyle = 'rgba(39, 39, 42, 0.6)'
      ctx.lineWidth = 1
      for (const l of links) {
        const s = l.source as SimNode
        const t = l.target as SimNode
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
      }

      // Draw nodes
      for (const n of nodes) {
        const r = getNodeRadius(n.followersCount)
        const isHovered = hoveredNode?.username === n.username

        // Glow
        if (isHovered) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(139, 92, 246, 0.35)'
          ctx.fill()
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        const grad = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 0, n.x, n.y, r)
        grad.addColorStop(0, isHovered ? '#a78bfa' : '#8b5cf6')
        grad.addColorStop(1, isHovered ? '#8b5cf6' : '#7c3aed')
        ctx.fillStyle = grad
        ctx.fill()

        // Border
        ctx.strokeStyle = isHovered ? '#c4b5fd' : 'rgba(139, 92, 246, 0.5)'
        ctx.lineWidth = isHovered ? 2 : 1
        ctx.stroke()

        // Username label
        ctx.fillStyle = '#fafafa'
        ctx.font = `${isHovered ? '600' : '400'} ${isHovered ? 12 : 10}px Inter Variable, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const label = n.username.length > 12 ? n.username.slice(0, 10) + '…' : n.username
        ctx.fillText(label, n.x, n.y + r + 14)
      }

      ctx.restore()
    }

    sim.on('tick', tick)
    sim.alphaTarget(0.3) // Keep it breathing

    // Mouse interactions
    const getMousePos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left - zoomX) / zoomK,
        y: (e.clientY - rect.top - zoomY) / zoomK,
      }
    }

    const findNodeAt = (mx: number, my: number) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const dx = mx - n.x, dy = my - n.y
        if (dx * dx + dy * dy <= getNodeRadius(n.followersCount) ** 2) {
          return n
        }
      }
      return null
    }

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = getMousePos(e)
      const node = findNodeAt(x, y)
      if (node) {
        dragging = node
        dragStartX = x
        dragStartY = y
        node.fx = node.x
        node.fy = node.y
        sim.alphaTarget(0.3).restart()
      } else {
        isPanning = true
        panStartX = e.clientX - zoomX
        panStartY = e.clientY - zoomY
        canvas.style.cursor = 'grabbing'
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = getMousePos(e)
      if (dragging) {
        dragging.fx = x
        dragging.fy = y
      } else if (isPanning) {
        zoomX = e.clientX - panStartX
        zoomY = e.clientY - panStartY
      } else {
        const node = findNodeAt(x, y)
        if (node) {
          setHoveredNode(node)
          canvas.style.cursor = 'pointer'
        } else {
          setHoveredNode(null)
          canvas.style.cursor = 'default'
        }
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (dragging) {
        const { x, y } = getMousePos(e)
        const moved = Math.abs(x - dragStartX) + Math.abs(y - dragStartY)
        if (moved < 5) {
          handleNodeClick(dragging)
        }
        dragging.fx = null
        dragging.fy = null
        dragging = null
      }
      isPanning = false
      canvas.style.cursor = hoveredNode ? 'pointer' : 'default'
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newK = Math.min(5, Math.max(0.2, zoomK * delta))
      const ratio = newK / zoomK
      zoomX = mx - (mx - zoomX) * ratio
      zoomY = my - (my - zoomY) * ratio
      zoomK = newK
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      sim.stop()
      simRef.current = null
    }
  }, [data, hoveredNode, handleNodeClick])

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ touchAction: 'none' }}
      />
    </div>
  )
}

function getNodeRadius(followersCount: number): number {
  if (followersCount <= 0) return 12
  return Math.min(28, 12 + Math.sqrt(followersCount) * 2)
}