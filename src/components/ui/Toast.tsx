import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, Info, X, AlertTriangle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `toast-${++counterRef.current}`
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const iconMap = {
  success: <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />,
  error: <XCircle size={14} className="text-rose-400 flex-shrink-0" />,
  info: <Info size={14} className="text-blue-400 flex-shrink-0" />,
  warning: <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />,
}

const borderMap = {
  success: 'border-emerald-500/20',
  error: 'border-rose-500/20',
  info: 'border-blue-500/20',
  warning: 'border-amber-500/20',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 bg-[#111827] border ${borderMap[toast.type]} rounded-lg shadow-xl shadow-black/40 animate-slide-in min-w-[240px] max-w-[360px]`}
    >
      {iconMap[toast.type]}
      <span className="text-xs text-slate-300 flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  )
}
