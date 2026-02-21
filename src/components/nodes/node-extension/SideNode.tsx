import { useRef, useLayoutEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Default card width when not provided (matches NodeShell). Use same value in GenericNode when passing widths. */
export const SIDE_NODE_DEFAULT_WIDTH = 220

export interface SideNodeProps {
  mainContent: ReactNode
  sidePanelContent: ReactNode
  sidePanelLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  mainWidth?: number | string
  /** When omitted, matches mainWidth so panel is same size as main card. */
  panelWidth?: number | string
  className?: string
}

export default function SideNode({
  mainContent,
  sidePanelContent,
  sidePanelLabel,
  open,
  onOpenChange,
  mainWidth = SIDE_NODE_DEFAULT_WIDTH,
  panelWidth,
  className = '',
}: SideNodeProps) {
  const mainW = typeof mainWidth === 'number' ? `${mainWidth}px` : mainWidth
  const resolvedPanelWidth = panelWidth ?? mainWidth
  const panelW = typeof resolvedPanelWidth === 'number' ? `${resolvedPanelWidth}px` : resolvedPanelWidth

  const mainRef = useRef<HTMLDivElement>(null)
  const [mainHeight, setMainHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = mainRef.current
    if (!el) return

    const syncHeight = () => setMainHeight(el.offsetHeight)
    syncHeight()

    const ro = new ResizeObserver(syncHeight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cardStyle = 'bg-[#0f1117] border border-slate-800 shadow-xl shadow-black/50'

  return (
    <div
      className={`flex items-start overflow-visible ${className}`}
      style={{ width: open ? `calc(${mainW} + 28px + ${panelW})` : undefined, minWidth: mainW }}
    >
      {/* Main card wrapper: drives row height; panel will be constrained to this height */}
      <div
        ref={mainRef}
        className={`flex-shrink-0 overflow-hidden ${open ? 'rounded-l-xl rounded-r-none' : 'rounded-xl'}`}
        style={{ width: mainW }}
      >
        {mainContent}
      </div>

      {/* Arrow toggle — height matches main card */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="nodrag flex-shrink-0 w-7 flex items-center justify-center bg-slate-800/90 border border-slate-700/80 border-l-0 hover:bg-slate-700/80 transition-colors text-slate-500 hover:text-slate-300"
        style={mainHeight != null ? { height: mainHeight } : undefined}
        aria-expanded={open}
        aria-label={open ? `Close ${sidePanelLabel}` : `Open ${sidePanelLabel}`}
      >
        {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Side panel — height locked to main card; content scrolls inside */}
      {open && (
        <div
          className={`flex-shrink-0 flex flex-col overflow-hidden border border-slate-800 border-l-0 rounded-r-xl ${cardStyle}`}
          style={{
            width: panelW,
            height: mainHeight ?? undefined,
            minHeight: mainHeight ?? undefined,
            maxHeight: mainHeight ?? undefined,
          }}
        >
          <div className="flex-shrink-0 px-2.5 py-1.5 border-b border-slate-800 bg-slate-800/50">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {sidePanelLabel}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2.5 py-2 overscroll-contain">
            {sidePanelContent}
          </div>
        </div>
      )}
    </div>
  )
}
