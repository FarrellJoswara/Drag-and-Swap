import { useState, useRef, useEffect } from 'react'

interface DeployNameModalProps {
  isOpen: boolean
  defaultName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function DeployNameModal({
  isOpen,
  defaultName,
  onConfirm,
  onCancel,
}: DeployNameModalProps) {
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName(defaultName)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen, defaultName])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#0f1117] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-100 mb-1">
          Name your agent
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Choose a name to identify this agent in your collection.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ETH to USDC Swapper"
            className="w-full px-3 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500/50 transition-colors"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Deploy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
