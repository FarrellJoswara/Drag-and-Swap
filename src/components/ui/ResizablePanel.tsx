import { useCallback, useRef, type ReactNode } from 'react'

const DEFAULT_MIN_H = 48
const DEFAULT_MAX_H = 400
const DEFAULT_MIN_W = 180
const DEFAULT_MAX_W = 600

interface ResizablePanelProps {
  height: number
  onHeightChange: (height: number) => void
  minHeight?: number
  maxHeight?: number
  width?: number
  onWidthChange?: (width: number) => void
  minWidth?: number
  maxWidth?: number
  children: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export default function ResizablePanel({
  height,
  onHeightChange,
  minHeight = DEFAULT_MIN_H,
  maxHeight = DEFAULT_MAX_H,
  width,
  onWidthChange,
  minWidth = DEFAULT_MIN_W,
  maxWidth = DEFAULT_MAX_W,
  children,
}: ResizablePanelProps) {
  const dragStartH = useRef({ y: 0, height: 0 })
  const dragStartW = useRef({ x: 0, width: 0 })

  const handleHeightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragStartH.current = { y: e.clientY, height }
      const onMove = (ev: MouseEvent) => {
        const newHeight = clamp(
          dragStartH.current.height + (ev.clientY - dragStartH.current.y),
          minHeight,
          maxHeight,
        )
        onHeightChange(newHeight)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [height, minHeight, maxHeight, onHeightChange],
  )

  const handleWidthMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onWidthChange || width == null) return
      e.preventDefault()
      dragStartW.current = { x: e.clientX, width }
      const onMove = (ev: MouseEvent) => {
        const newWidth = clamp(
          dragStartW.current.width + (ev.clientX - dragStartW.current.x),
          minWidth,
          maxWidth,
        )
        onWidthChange(newWidth)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [width, minWidth, maxWidth, onWidthChange],
  )

  return (
    <div
      className="flex flex-col min-w-0 flex-none"
      style={{ height: `${height}px`, flex: '0 0 auto' }}
    >
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col flex relative">
        {children}
        {onWidthChange != null && width != null && (
          <div
            role="separator"
            aria-label="Resize width"
            className="nodrag nopan absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize flex items-center justify-center bg-slate-800/80 hover:bg-slate-700/80 transition-colors"
            onMouseDown={handleWidthMouseDown}
          >
            <span className="h-6 w-0.5 rounded-full bg-slate-500/60" aria-hidden />
          </div>
        )}
      </div>
      <div
        role="separator"
        aria-label="Resize height"
        className="nodrag nopan h-1.5 flex-shrink-0 cursor-ns-resize flex items-center justify-center bg-slate-800/80 hover:bg-slate-700/80 transition-colors"
        onMouseDown={handleHeightMouseDown}
      >
        <span className="w-6 h-0.5 rounded-full bg-slate-500/60" aria-hidden />
      </div>
    </div>
  )
}
