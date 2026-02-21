import { X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAddServerSigner } from '../../hooks/useAddServerSigner'
import { useToast } from './Toast'

interface AllowTradeOnBehalfModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Shown when the user adds a "Trade on my behalf" block. Lets them enable the app
 * server signer so swaps can run without a wallet popup when offline.
 */
export default function AllowTradeOnBehalfModal({ isOpen, onClose }: AllowTradeOnBehalfModalProps) {
  const { addServerSigner, isLoading, isAvailable, error } = useAddServerSigner()
  const { toast } = useToast()

  if (!isOpen) return null

  const handleEnable = async () => {
    const result = await addServerSigner()
    if (result.success) {
      toast('Trade on my behalf enabled', 'success')
      onClose()
    } else {
      toast(result.error ?? 'Failed to enable', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0f1117] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-violet-400 flex-shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100">Allow app to trade on your behalf?</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            The app can then execute swaps from your wallet without a popup when you're offline (e.g. limit orders,
            rebalancing). Only enable if you trust this app.
          </p>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90">
              The app (and agents you configure) will be able to move funds from your wallet according to the flows you
              build.
            </p>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={handleEnable}
              disabled={!isAvailable || isLoading}
              className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Enabling…' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
