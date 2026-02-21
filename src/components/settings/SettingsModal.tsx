import { useState, useRef, useEffect } from 'react'
import { X, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useAddServerSigner } from '../../hooks/useAddServerSigner'
import { useToast } from '../ui/Toast'

const CONFIRM_TEXT = 'ALLOW'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [confirmInput, setConfirmInput] = useState('')
  const [step, setStep] = useState<'warning' | 'confirm'>('warning')
  const inputRef = useRef<HTMLInputElement>(null)
  const { addServerSigner, isLoading, isAvailable, error } = useAddServerSigner()
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      setStep('warning')
      setConfirmInput('')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && step === 'confirm') setTimeout(() => inputRef.current?.focus(), 0)
  }, [isOpen, step])

  if (!isOpen) return null

  const confirmed = confirmInput.trim().toUpperCase() === CONFIRM_TEXT

  const handleEnable = async () => {
    if (step === 'warning') {
      setStep('confirm')
      return
    }
    if (!confirmed) return
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0f1117] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/80 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Allow apps to trade on my behalf */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-violet-400 flex-shrink-0" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Allow apps to trade on my behalf
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When enabled, the app can submit transactions from your embedded wallet even when you are offline (e.g. to run limit orders or rebalancing). You must also enable this per agent in each agent’s settings.
            </p>

            {step === 'warning' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90">
                  Only enable this if you trust this app. The app (and agents you grant permission to) will be able to move funds from your wallet according to the flows you configure.
                </p>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Type <strong className="text-slate-300 font-mono">{CONFIRM_TEXT}</strong> below to confirm you understand the risks.
                </p>
                <input
                  ref={inputRef}
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={CONFIRM_TEXT}
                  className="w-full px-3 py-2.5 text-sm font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500/50 transition-colors"
                  autoComplete="off"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-400">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              {step === 'confirm' && (
                <button
                  type="button"
                  onClick={() => { setStep('warning'); setConfirmInput('') }}
                  className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleEnable}
                disabled={!isAvailable || isLoading || (step === 'confirm' && !confirmed)}
                className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Enabling…' : step === 'warning' ? 'Continue' : 'Enable'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
