import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useCallStore } from '../../store/useCallStore'
import type { TopicNode } from '@shared/types'
import { markLatency } from '@shared/latency'

const NODE_W = 300
const NODE_H = 68
const ROUTE_W = 240
const ROUTE_H = 48
const ROUTE_GAP = 14
const CONN_GAP = 26
const NODE_GAP = 40
const USER_COLOR = '#3b82f6'
const OTHER_COLOR = '#a855f7'
const ROUTE_COLOR = '#ffcc00'

interface RouteNodeLayout {
  id: string
  x: number
  y: number
  text: string
  index: number
  active: boolean
}

interface LayoutNode {
  node: TopicNode
  x: number
  y: number
  routes: RouteNodeLayout[]
  isActive: boolean
}

export function ConversationTree(): React.ReactElement {
  const topicNodes = useCallStore((s) => s.topicNodes)
  const containerRef = useRef<HTMLDivElement>(null)

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })

  const laidOut = useMemo(() => {
    markLatency('tree-rendered', `${topicNodes.length} nodes`)
    return layout(topicNodes)
  }, [topicNodes])

  useEffect(() => {
    if (laidOut.length === 0) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const last = laidOut[laidOut.length - 1]
    const x = -(last.x + NODE_W / 2) + rect.width / 2
    const y = -(last.y + NODE_H / 2) + rect.height / 2
    setPan({ x, y })
  }, [laidOut.length])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { ...pan }
    e.preventDefault()
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y)
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = -e.deltaY * 0.001
    const newZoom = Math.max(0.2, Math.min(3, zoom * (1 + delta)))
    const r = newZoom / zoom
    setPan({ x: mx - (mx - pan.x) * r, y: my - (my - pan.y) * r })
    setZoom(newZoom)
  }, [zoom, pan])

  if (laidOut.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-white/20">
          <div className="text-lg font-medium mb-2">Waiting for conversation</div>
          <div className="text-sm">Topics will appear as conversation nodes</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing select-none"
      style={{ background: '#080808' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        className="absolute"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform'
        }}
      >
        <svg className="absolute pointer-events-none" style={{ left: -100, top: -100, width: 8000, height: 2000 }}>
          {laidOut.map((item, i) => {
            if (i === 0) return null
            const prev = laidOut[i - 1]
            return (
              <line
                key={`line-${i}`}
                x1={prev.x + NODE_W + 100}
                y1={prev.y + NODE_H / 2 + 100}
                x2={item.x + 100}
                y2={item.y + NODE_H / 2 + 100}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            )
          })}
          {laidOut.map((item) =>
            item.routes.map((route) => (
              <line
                key={`route-line-${item.node.id}-${route.index}`}
                x1={item.x + NODE_W + 100}
                y1={item.y + NODE_H / 2 + 100}
                x2={route.x + 100}
                y2={route.y + ROUTE_H / 2 + 100}
                stroke="rgba(255,204,0,0.20)"
                strokeWidth={1}
              />
            ))
          )}
        </svg>

        {laidOut.map((item) => (
          <TopicNodeComponent key={item.node.id} item={item} />
        ))}
      </div>

      <div
        className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg pointer-events-none"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          className="text-white/40 hover:text-white/70 text-xs pointer-events-auto"
          onClick={() => setZoom(Math.max(0.2, zoom / 1.3))}
        >
          −
        </button>
        <span className="text-[10px] text-white/30 tabular-nums w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="text-white/40 hover:text-white/70 text-xs pointer-events-auto"
          onClick={() => setZoom(Math.min(3, zoom * 1.3))}
        >
          +
        </button>
      </div>

      <button
        className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg text-[10px] text-white/40 hover:text-white/70 pointer-events-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => {
          if (laidOut.length === 0) return
          const container = containerRef.current
          if (!container) return
          const rect = container.getBoundingClientRect()
          const last = laidOut[laidOut.length - 1]
          setPan({
            x: -(last.x + NODE_W / 2) + rect.width / 2,
            y: -(last.y + NODE_H / 2) + rect.height / 2
          })
          setZoom(1)
        }}
      >
        Center
      </button>
    </div>
  )
}

function TopicNodeComponent({ item }: { item: LayoutNode }): React.ReactElement {
  const isUser = item.node.speaker === 'user'
  const color = isUser ? USER_COLOR : OTHER_COLOR
  const time = formatTime(item.node.endTime)
  const active = item.isActive
  const detail = item.node.detail

  return (
    <>
      <div
        className="absolute flex flex-col justify-center"
        style={{
          left: item.x,
          top: item.y,
          width: NODE_W,
          minHeight: NODE_H,
          borderRadius: 10,
          background: active
            ? `linear-gradient(135deg, ${color}18, ${color}08)`
            : 'rgba(255,255,255,0.04)',
          border: `1px solid ${active ? color + '44' : 'rgba(255,255,255,0.06)'}`,
          padding: '10px 14px',
          pointerEvents: 'none'
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[10px] text-white/30 font-medium">
            {isUser ? 'You' : 'Them'}
          </span>
          {item.node.provisional && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: 'rgba(255,204,0,0.15)',
                color: 'rgba(255,204,0,0.9)'
              }}
            >
              QUICK
            </span>
          )}
          {!item.node.provisional && detail && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: 'rgba(59,130,246,0.15)',
                color: 'rgba(96,165,250,0.95)'
              }}
            >
              DEEP
            </span>
          )}
          {item.node.signal && (
            <span className="text-[9px] text-white/25 uppercase tracking-wider ml-auto">
              {item.node.signal.replace('_', ' ')}
            </span>
          )}
          <span className="text-[10px] text-white/20 ml-auto tabular-nums">{time}</span>
        </div>
        <div
          className="text-sm font-semibold text-white/90 leading-snug"
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {item.node.topic}
        </div>
      </div>

      {item.routes.map((route) => {
        const rdetail = detail?.routeDetails.find((d) => d.route === route.text)
        return (
          <div
            key={route.id}
            className="absolute flex items-center gap-2"
            style={{
              left: route.x,
              top: route.y,
              width: ROUTE_W,
              minHeight: ROUTE_H,
              borderRadius: 9,
              background: route.active
                ? `linear-gradient(135deg, ${ROUTE_COLOR}1c, ${ROUTE_COLOR}08)`
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${route.active ? `${ROUTE_COLOR}55` : 'rgba(255,255,255,0.08)'}`,
              padding: '8px 12px',
              pointerEvents: 'none'
            }}
          >
            <span
              className="text-[10px] font-bold shrink-0 w-5 h-5 flex items-center justify-center rounded-full"
              style={{
                background: route.active ? 'rgba(255,204,0,0.22)' : 'rgba(255,255,255,0.08)',
                color: route.active ? ROUTE_COLOR : 'rgba(255,255,255,0.45)'
              }}
            >
              {route.index + 1}
            </span>
            <div className="flex flex-col min-w-0">
              <span
                className="text-[11px] font-medium text-white/70 leading-snug"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {route.text}
              </span>
              {rdetail && (
                <span className="text-[9px] text-white/35 leading-snug mt-0.5 truncate">
                  {rdetail.why}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

function layout(nodes: TopicNode[]): LayoutNode[] {
  const CENTER_Y = 200
  const maxRoutes = 4

  return nodes.map((node, i) => {
    const active = i === nodes.length - 1
    const x = i * (NODE_W + CONN_GAP + ROUTE_W + NODE_GAP)
    const routesX = x + NODE_W + CONN_GAP
    const routes = node.routes.slice(0, maxRoutes).map((text, j) => ({
      id: `${node.id}-route-${j}`,
      x: routesX,
      y: CENTER_Y + (j - (node.routes.slice(0, maxRoutes).length - 1) / 2) * (ROUTE_H + ROUTE_GAP),
      text,
      index: j,
      active
    }))

    return {
      node,
      x,
      y: CENTER_Y,
      routes,
      isActive: active
    }
  })
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}