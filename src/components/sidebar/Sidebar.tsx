import { Link } from 'react-router-dom'
import { Calculator, ChevronDown, ChevronRight, Eye, Filter, Info, LayoutGrid, PanelLeftClose, PanelLeft, Repeat2, Search, Zap } from 'lucide-react'
import { useState, useMemo, useCallback, useRef, useEffect, type DragEvent } from 'react'
import {
  getBlocksByCategory,
  getBlocksByCategoryGroupedByService,
  getBlockIcon,
  sidebarColorClasses,
  type BlockDefinition,
  type BlockCategory,
} from '../../lib/blockRegistry'

const SERVICE_LABELS: Record<string, string> = {
  hyperliquid: 'Hyperliquid',
  uniswap: 'Uniswap',
  quicknode: 'QuickNode',
}

const SERVICE_ACCENT: Record<string, string> = {
  hyperliquid: 'border-emerald-500/30 bg-emerald-500/5',
  uniswap: 'border-rose-500/30 bg-rose-500/5',
  quicknode: 'border-violet-500/30 bg-violet-500/5',
}

function DraggableBlock({ block }: { block: BlockDefinition }) {
  const colors = sidebarColorClasses[block.color]
  const Icon = getBlockIcon(block.icon)
  const [showTooltip, setShowTooltip] = useState(false)

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/reactflow', block.type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="relative group/block">
      <div
        draggable
        onDragStart={handleDragStart}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg
          bg-[#0f1117] border ${colors.border}
          cursor-grab active:cursor-grabbing
          transition-all duration-150
          hover:bg-slate-800/50 hover:shadow-lg hover:shadow-black/30
          hover:-translate-y-0.5
        `}
      >
        <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0 ${colors.text}`}>
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-300 group-hover/block:text-slate-100 transition-colors truncate">{block.label}</p>
          <p className="text-[10px] text-slate-600 group-hover/block:text-slate-500 transition-colors line-clamp-2">{block.description}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
          <Info size={10} className="text-slate-500" />
        </div>
      </div>
      {showTooltip && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 p-2.5 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-[10px] text-slate-300 leading-relaxed"
        >
          <p className="font-medium text-slate-200 mb-1">{block.label}</p>
          <p className="whitespace-normal">{block.description}</p>
        </div>
      )}
    </div>
  )
}

function filterBlocks(blocks: BlockDefinition[], q: string) {
  if (!q) return blocks
  const lower = q.toLowerCase()
  return blocks.filter(
    (b) => b.label.toLowerCase().includes(lower) || b.description.toLowerCase().includes(lower),
  )
}

function CollapsibleCategorySection({
  title,
  icon,
  category,
  query,
  defaultOpen = true,
}: {
  title: string
  icon: React.ReactNode
  category: BlockCategory
  query: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const { byService, general } = useMemo(() => {
    const raw = getBlocksByCategoryGroupedByService(category)
    const filter = (arr: BlockDefinition[]) => filterBlocks(arr, query)
    const byService: Record<string, BlockDefinition[]> = {}
    for (const [k, v] of Object.entries(raw.byService)) {
      const filtered = filter(v)
      if (filtered.length > 0) byService[k] = filtered
    }
    return { byService, general: filter(raw.general) }
  }, [category, query])

  const totalCount = general.length + Object.values(byService).flat().length
  if (totalCount === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full mb-2 px-1 py-0.5 rounded hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
          <span className="text-slate-500">{icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
        </div>
        <span className="text-[9px] text-slate-600">({totalCount})</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          {general.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {general.map((block) => (
                <DraggableBlock key={block.type} block={block} />
              ))}
            </div>
          )}
          {Object.entries(byService).map(([service, blocks]) => (
            <div key={service} className="flex flex-col gap-1.5">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${SERVICE_ACCENT[service] ?? 'border-slate-700/50 bg-slate-800/30'}`}>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  {SERVICE_LABELS[service] ?? service}
                </span>
              </div>
              {blocks.map((block) => (
                <DraggableBlock key={block.type} block={block} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────

const SIDEBAR_STORAGE_KEY = 'dragnswap-sidebar'
const DEFAULT_WIDTH = 280
const MIN_WIDTH = 200
const MAX_WIDTH = 480
const COLLAPSED_WIDTH = 52

function loadSidebarState(): { width: number; collapsed: boolean } {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { width?: number; collapsed?: boolean }
      return {
        width: typeof parsed.width === 'number' ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width)) : DEFAULT_WIDTH,
        collapsed: !!parsed.collapsed,
      }
    }
  } catch {
    // ignore
  }
  return { width: DEFAULT_WIDTH, collapsed: false }
}

export default function Sidebar() {
  const [query, setQuery] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const resizeStartRef = useRef({ x: 0, width: 0 })

  useEffect(() => {
    const state = loadSidebarState()
    setSidebarWidth(state.width)
    setCollapsed(state.collapsed)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ width: sidebarWidth, collapsed }))
    } catch {
      // ignore
    }
  }, [sidebarWidth, collapsed])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizeStartRef.current = { x: e.clientX, width: sidebarWidth }
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartRef.current.x
      setSidebarWidth((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const noBlocks = useMemo(() => {
    const hasTriggers = filterBlocks(getBlocksByCategory('trigger'), query).length > 0
    const hasActions = filterBlocks(getBlocksByCategory('action'), query).length > 0
    const hasFilters = filterBlocks(getBlocksByCategory('filter'), query).length > 0
    const hasDisplay = filterBlocks(getBlocksByCategory('display'), query).length > 0
    const hasMath = filterBlocks(getBlocksByCategory('math'), query).length > 0
    return !hasTriggers && !hasActions && !hasFilters && !hasDisplay && !hasMath
  }, [query])

  const width = collapsed ? COLLAPSED_WIDTH : sidebarWidth

  return (
    <aside
      className="flex-shrink-0 h-full bg-[#0a0a0f] border-r border-slate-800/60 flex flex-col relative transition-[width] duration-200 ease-out"
      style={{ width }}
    >
      {/* Collapsed: only expand button + logo */}
      {collapsed ? (
        <div className="flex flex-col items-center py-3 gap-4 flex-1">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors"
            title="Expand sidebar"
          >
            <PanelLeft size={18} />
          </button>
          <Link
            to="/"
            className="flex items-center justify-center w-14 h-14 flex-shrink-0"
            title="Dragn Swap"
          >
            <img src="/logo-alt.png" alt="Logo" className="w-full h-full object-contain opacity-90 hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      ) : (
        <>
          {/* Logo / Brand */}
          <div className="px-4 py-4 border-b border-slate-800/60 flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Link to="/" className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <img src="/logo-alt.png" alt="Dragn Swap Logo" className="w-full h-full object-contain opacity-90 hover:opacity-100 transition-opacity" />
              </Link>
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-100 tracking-tight truncate">Dragn Swap</p>
                <p className="text-[10px] text-slate-500">DeFi Automation</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors flex-shrink-0"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <Link
            to="/"
            className="mx-3 mt-2 flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <LayoutGrid size={12} />
            <span className="text-xs font-medium">My Agents</span>
          </Link>

          {/* Search */}
          <div className="px-3 py-3">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg focus-within:border-indigo-500/50 transition-colors">
              <Search size={12} className="text-slate-600 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search blocks…"
                className="bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none w-full"
              />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 px-3 pb-4 flex flex-col gap-5 overflow-y-auto">
        <CollapsibleCategorySection
          title="Triggers"
          icon={<Zap size={11} />}
          category="trigger"
          query={query}
        />
        <CollapsibleCategorySection
          title="Actions"
          icon={<Repeat2 size={11} />}
          category="action"
          query={query}
        />
        <CollapsibleCategorySection
          title="Filters"
          icon={<Filter size={11} />}
          category="filter"
          query={query}
        />
        <CollapsibleCategorySection
          title="Math"
          icon={<Calculator size={11} />}
          category="math"
          query={query}
        />
        <CollapsibleCategorySection
          title="Display"
          icon={<Eye size={11} />}
          category="display"
          query={query}
        />

        {noBlocks && query && (
          <div className="text-center py-8">
            <p className="text-[10px] text-slate-600">No results for "{query}"</p>
          </div>
        )}
      </div>

          {/* Footer */}
          <div className="px-3 pb-3">
            <div className="px-3 py-2 bg-slate-900/50 border border-slate-800/50 rounded-lg">
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Connect nodes to build your automation flow.
              </p>
            </div>
          </div>
        </>
      )}

      {/* Resize handle (only when expanded) */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors group"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 -left-1 w-3" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-12 bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </aside>
  )
}
