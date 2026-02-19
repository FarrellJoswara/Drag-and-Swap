import { Monitor } from 'lucide-react'

export default function MobileWarning() {
  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0a0f] flex items-center justify-center p-6 md:hidden">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
          <Monitor size={28} className="text-indigo-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-200 mb-2">
          Desktop Required
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Drag & Swap is a visual node editor designed for desktop browsers.
          Please switch to a larger screen for the best experience.
        </p>
      </div>
    </div>
  )
}
