import { Link } from 'react-router-dom'
import { Braces, Filter, LayoutGrid, Plus, Repeat2, Search, Trash2, Zap } from 'lucide-react'
import { useState, useMemo, type DragEvent } from 'react'
import {
  getBlocksByCategory,
  getBlockIcon,
  sidebarColorClasses,
  type BlockDefinition,
} from '../../lib/blockRegistry'
import { useVariables, type Variable } from '../../lib/VariableContext'

// ── Block helpers ─────────────────────────────────────────

function SectionLabel({ title, icon, trailing }: { title: string; icon: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
      </div>
      {trailing}
    </div>
  )
}

function DraggableBlock({ block }: { block: BlockDefinition }) {
  const colors = sidebarColorClasses[block.color]
  const Icon = getBlockIcon(block.icon)

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/reactflow', block.type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg
        bg-[#0f1117] border ${colors.border}
        cursor-grab active:cursor-grabbing
        transition-all duration-150 group
        hover:bg-slate-800/50 hover:shadow-lg hover:shadow-black/30
        hover:-translate-y-0.5
      `}
    >
      <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0 ${colors.text}`}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors truncate">{block.label}</p>
        <p className="text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors truncate">{block.description}</p>
      </div>
    </div>
  )
}

function BlockSection({ title, icon, blocks }: { title: string; icon: React.ReactNode; blocks: BlockDefinition[] }) {
  return (
    <div>
      <SectionLabel title={title} icon={icon} />
      <div className="flex flex-col gap-1.5">
        {blocks.map((block) => (
          <DraggableBlock key={block.type} block={block} />
        ))}
      </div>
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

// ── Variable helpers ──────────────────────────────────────

function DraggableVariable({
  variable,
  onUpdate,
  onDelete,
}: {
  variable: Variable
  onUpdate: (id: string, updates: Partial<Pick<Variable, 'name' | 'value'>>) => void
  onDelete: (id: string) => void
}) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/variable', variable.name)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#0f1117] border border-blue-500/20 hover:border-blue-500/40 cursor-grab active:cursor-grabbing transition-all group hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
    >
      <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center flex-shrink-0">
        <Braces size={11} className="text-blue-400" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <input
          type="text"
          value={variable.name}
          onChange={(e) => onUpdate(variable.id, { name: e.target.value })}
          placeholder="name"
          className="bg-transparent text-[11px] font-medium text-blue-300 placeholder-slate-600 outline-none w-full truncate"
          onMouseDown={(e) => e.stopPropagation()}
        />
        <input
          type="text"
          value={variable.value}
          onChange={(e) => onUpdate(variable.id, { value: e.target.value })}
          placeholder="value"
          className="bg-transparent text-[10px] text-slate-500 placeholder-slate-700 outline-none w-full truncate font-mono"
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      <button
        onClick={() => onDelete(variable.id)}
        className="p-0.5 text-slate-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

function filterVariables(variables: Variable[], q: string) {
  if (!q) return variables
  const lower = q.toLowerCase()
  return variables.filter(
    (v) => v.name.toLowerCase().includes(lower) || v.value.toLowerCase().includes(lower),
  )
}

// ── Sidebar ───────────────────────────────────────────────

export default function Sidebar() {
  const [query, setQuery] = useState('')
  const { variables, addVariable, updateVariable, removeVariable } = useVariables()

  const triggers = useMemo(() => getBlocksByCategory('trigger'), [])
  const actions = useMemo(() => getBlocksByCategory('action'), [])
  const filters = useMemo(() => getBlocksByCategory('filter'), [])

  const filteredTriggers = useMemo(() => filterBlocks(triggers, query), [triggers, query])
  const filteredActions = useMemo(() => filterBlocks(actions, query), [actions, query])
  const filteredFilters = useMemo(() => filterBlocks(filters, query), [filters, query])
  const filteredVariables = useMemo(() => filterVariables(variables, query), [variables, query])

  const handleAddVariable = () => {
    addVariable(`var${variables.length + 1}`, '')
  }

  const noBlocks = filteredTriggers.length === 0 && filteredActions.length === 0 && filteredFilters.length === 0
  const noVariables = filteredVariables.length === 0 && variables.length === 0

  return (
    <aside className="w-[220px] flex-shrink-0 h-full bg-[#0a0a0f] border-r border-slate-800/60 flex flex-col">
      {/* Logo / Brand */}
      <div className="px-4 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Repeat2 size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100 tracking-tight">Drag & Swap</p>
            <p className="text-[10px] text-slate-500">DeFi Automation</p>
          </div>
        </div>
        <Link
          to="/agents"
          className="mt-3 flex items-center gap-2 px-2.5 py-2 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
        >
          <LayoutGrid size={12} />
          <span className="text-xs font-medium">My Agents</span>
        </Link>
      </div>

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
        {/* Block sections */}
        {filteredTriggers.length > 0 && (
          <BlockSection title="Triggers" icon={<Zap size={11} />} blocks={filteredTriggers} />
        )}
        {filteredActions.length > 0 && (
          <BlockSection title="Actions" icon={<Repeat2 size={11} />} blocks={filteredActions} />
        )}
        {filteredFilters.length > 0 && (
          <BlockSection title="Filters" icon={<Filter size={11} />} blocks={filteredFilters} />
        )}

        {noBlocks && noVariables && query && (
          <div className="text-center py-8">
            <p className="text-[10px] text-slate-600">No results for "{query}"</p>
          </div>
        )}

        {/* Variables section */}
        <div>
          <SectionLabel
            title="Variables"
            icon={<Braces size={11} />}
            trailing={
              <button
                onClick={handleAddVariable}
                className="p-1 text-slate-600 hover:text-blue-400 transition-colors rounded hover:bg-blue-500/10"
                title="Add variable"
              >
                <Plus size={11} />
              </button>
            }
          />
          <div className="flex flex-col gap-1.5">
            {filteredVariables.map((v) => (
              <DraggableVariable
                key={v.id}
                variable={v}
                onUpdate={updateVariable}
                onDelete={removeVariable}
              />
            ))}
            {variables.length === 0 && (
              <button
                onClick={handleAddVariable}
                className="flex items-center justify-center gap-1.5 py-3 border border-dashed border-slate-800 hover:border-blue-500/30 rounded-lg text-[10px] text-slate-600 hover:text-blue-400 transition-colors"
              >
                <Plus size={10} />
                Add your first variable
              </button>
            )}
          </div>
          {variables.length > 0 && (
            <p className="text-[9px] text-slate-700 mt-2 px-1">
              Drag onto any input field to use
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 pb-3">
        <div className="px-3 py-2 bg-slate-900/50 border border-slate-800/50 rounded-lg">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Connect nodes to build your automation flow.
          </p>
        </div>
      </div>
    </aside>
  )
}
