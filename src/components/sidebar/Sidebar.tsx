import { Bell, Eye, Filter, Repeat2, Shield, Zap } from 'lucide-react'
import type { DragEvent } from 'react'

export type NodeType = 'whaleWatcher' | 'priceAlert' | 'uniswapSwap'

interface BlockDef {
  type: NodeType
  label: string
  description: string
  icon: React.ReactNode
  color: string
  textColor: string
  borderColor: string
}

const TRIGGERS: BlockDef[] = [
  {
    type: 'whaleWatcher',
    label: 'Whale Watcher',
    description: 'Monitor large wallet activity',
    icon: <Eye size={15} />,
    color: 'bg-violet-500/10',
    textColor: 'text-violet-400',
    borderColor: 'border-violet-500/20 hover:border-violet-500/50',
  },
  {
    type: 'priceAlert',
    label: 'Price Alert',
    description: 'Trigger on token price change',
    icon: <Bell size={15} />,
    color: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/20 hover:border-amber-500/50',
  },
]

const ACTIONS: BlockDef[] = [
  {
    type: 'uniswapSwap',
    label: 'Uniswap Swap',
    description: 'Execute a token swap on Uniswap V3',
    icon: <Zap size={15} />,
    color: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/20 hover:border-emerald-500/50',
  },
]

const FILTERS: BlockDef[] = [
  {
    type: 'whaleWatcher', // placeholder — can extend later
    label: 'Value Filter',
    description: 'Filter by transaction value',
    icon: <Filter size={15} />,
    color: 'bg-blue-500/10',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/20 hover:border-blue-500/50',
  },
  {
    type: 'whaleWatcher', // placeholder
    label: 'Gas Guard',
    description: 'Skip when gas is too high',
    icon: <Shield size={15} />,
    color: 'bg-rose-500/10',
    textColor: 'text-rose-400',
    borderColor: 'border-rose-500/20 hover:border-rose-500/50',
  },
]

interface SectionProps {
  title: string
  icon: React.ReactNode
  blocks: BlockDef[]
}

function SectionLabel({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      <span className="text-slate-500">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
    </div>
  )
}

function DraggableBlock({ block }: { block: BlockDef }) {
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
        bg-[#0f1117] border ${block.borderColor}
        cursor-grab active:cursor-grabbing
        transition-all duration-150 group
        hover:bg-slate-800/50 hover:shadow-lg hover:shadow-black/30
        hover:-translate-y-0.5
      `}
    >
      <div className={`w-8 h-8 rounded-lg ${block.color} flex items-center justify-center flex-shrink-0 ${block.textColor}`}>
        {block.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors truncate">{block.label}</p>
        <p className="text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors truncate">{block.description}</p>
      </div>
    </div>
  )
}

function Section({ title, icon, blocks }: SectionProps) {
  return (
    <div>
      <SectionLabel title={title} icon={icon} />
      <div className="flex flex-col gap-1.5">
        {blocks.map((block, i) => (
          <DraggableBlock key={`${block.label}-${i}`} block={block} />
        ))}
      </div>
    </div>
  )
}

export default function Sidebar() {
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
      </div>

      {/* Search hint */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
          <span className="text-[10px] text-slate-600">Drag blocks onto canvas →</span>
        </div>
      </div>

      {/* Block sections */}
      <div className="flex-1 px-3 pb-4 flex flex-col gap-5 overflow-y-auto">
        <Section title="Triggers" icon={<Zap size={11} />} blocks={TRIGGERS} />
        <Section title="Actions" icon={<Repeat2 size={11} />} blocks={ACTIONS} />
        <Section title="Filters" icon={<Filter size={11} />} blocks={FILTERS} />
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
