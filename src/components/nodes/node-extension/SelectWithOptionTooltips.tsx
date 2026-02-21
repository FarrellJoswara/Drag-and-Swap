import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface SelectWithOptionTooltipsProps {
  value: string
  options: string[]
  optionDescriptions?: Record<string, string>
  onChange: (value: string) => void
  disabled?: boolean
  /** Tailwind class for focus ring (e.g. from focusColorClass[color]) */
  focusClass?: string
  /** Base input classes (border, bg, etc.) */
  baseClass?: string
}

const defaultBase =
  'w-full bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-all'

export default function SelectWithOptionTooltips({
  value,
  options,
  optionDescriptions = {},
  onChange,
  disabled = false,
  focusClass = 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30',
  baseClass = defaultBase,
}: SelectWithOptionTooltipsProps) {
  const [open, setOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (open && buttonRef.current) {
      setDropdownRect(buttonRef.current.getBoundingClientRect())
    } else {
      setDropdownRect(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (containerRef.current?.contains(target)) return
      if (target.closest('[data-select-dropdown-list]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const selectedLabel = options.includes(value) ? value : (value || options[0]) ?? ''

  const portalContent =
    typeof document !== 'undefined' &&
    open &&
    dropdownRect &&
    createPortal(
      <div
        data-select-dropdown-list
        className="fixed z-[9999] py-1 rounded-md border border-slate-700 bg-slate-900 shadow-xl shadow-black/50 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{
          left: dropdownRect.left,
          top: dropdownRect.bottom + 4,
          width: Math.max(dropdownRect.width, 160),
          maxHeight: 280,
        }}
      >
        <ul role="listbox" className="w-full">
          {options.map((opt) => {
            const desc = optionDescriptions[opt]
            const isSelected = value === opt
            return (
              <li
                key={opt}
                role="option"
                aria-selected={isSelected}
                title={desc}
                className={`px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-200 hover:bg-slate-700/80'
                }`}
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
              >
                <span className="block truncate">{opt}</span>
                {desc && (
                  <span className="block text-[10px] text-slate-500 truncate mt-0.5">{desc}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>,
      document.body,
    )

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`nodrag ${baseClass} ${focusClass} appearance-none cursor-pointer px-2.5 py-1.5 pr-7 text-left flex items-center justify-between w-full ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={10}
          className={`flex-shrink-0 ml-1 text-slate-500 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {portalContent}
    </div>
  )
}
