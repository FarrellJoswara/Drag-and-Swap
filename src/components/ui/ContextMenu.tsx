import { Copy, Trash2 } from 'lucide-react'

interface ContextMenuProps {
  x: number
  y: number
  nodeId: string
  onClose: () => void
  onDuplicate: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}

export default function ContextMenu({
  x,
  y,
  nodeId,
  onClose,
  onDuplicate,
  onDelete,
}: ContextMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="fixed z-[101] bg-[#111827] border border-slate-800 rounded-lg shadow-xl shadow-black/50 py-1 min-w-[160px] animate-fade-in"
        style={{ left: x, top: y }}
      >
        <button
          onClick={() => {
            onDuplicate(nodeId)
            onClose()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          <Copy size={12} />
          Duplicate
        </button>
        <div className="mx-2 h-px bg-slate-800" />
        <button
          onClick={() => {
            onDelete(nodeId)
            onClose()
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </>
  )
}
