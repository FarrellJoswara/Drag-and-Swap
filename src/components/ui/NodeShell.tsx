import type { ReactNode } from 'react'

type BadgeColor = 'violet' | 'amber' | 'emerald' | 'blue' | 'rose'

interface NodeShellProps {
  children: ReactNode
  label: string
  icon: ReactNode
  category: 'trigger' | 'action' | 'filter'
  badge: string
  badgeColor: BadgeColor
  selected?: boolean
}

const badgeStyles: Record<BadgeColor, string> = {
  violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  emerald:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  rose:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

const ringStyles: Record<BadgeColor, string> = {
  violet: 'ring-violet-500/40',
  amber:  'ring-amber-500/40',
  emerald:'ring-emerald-500/40',
  blue:   'ring-blue-500/40',
  rose:   'ring-rose-500/40',
}

const topBorderStyles: Record<BadgeColor, string> = {
  violet: 'from-violet-500/60 to-violet-500/0',
  amber:  'from-amber-500/60 to-amber-500/0',
  emerald:'from-emerald-500/60 to-emerald-500/0',
  blue:   'from-blue-500/60 to-blue-500/0',
  rose:   'from-rose-500/60 to-rose-500/0',
}

export default function NodeShell({ children, label, icon, badge, badgeColor, selected }: NodeShellProps) {
  return (
    <div
      className={[
        'relative w-[220px] rounded-xl overflow-hidden',
        'bg-[#0f1117] border border-slate-800',
        'shadow-xl shadow-black/50',
        selected ? `ring-1 ${ringStyles[badgeColor]}` : '',
        'transition-all duration-150',
      ].join(' ')}
    >
      {/* Gradient top accent */}
      <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${topBorderStyles[badgeColor]}`} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center">
            {icon}
          </div>
          <span className="text-xs font-semibold text-slate-200 tracking-tight">{label}</span>
        </div>
        <span className={`text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded border ${badgeStyles[badgeColor]}`}>
          {badge}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-slate-800/80" />

      {/* Body */}
      <div className="px-3 py-2.5">
        {children}
      </div>
    </div>
  )
}
