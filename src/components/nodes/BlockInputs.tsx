import { createPortal } from 'react-dom'
import { Braces, ChevronDown, Wallet, Plus, X, Circle } from 'lucide-react'
import { useCallback, useState, useRef, useEffect, type DragEvent } from 'react'
import {
  DEFAULT_TOKENS,
  type InputField,
  type BlockColor,
  focusColorClass,
  accentBgClass,
} from '../../lib/blockRegistry'
import SelectWithOptionTooltips from './node-extension/SelectWithOptionTooltips'
import { useWalletAddress } from '../../hooks/useWalletAddress'
import { usePrivy } from '@privy-io/react-auth'

// ── Shared ────────────────────────────────────────────────

const baseInput = (focus: string) =>
  `nodrag w-full bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-all ${focus}`

// ── Variable pill (shown when a variable is dropped on a field) ──

function VariablePill({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-md">
      <Braces size={10} className="text-blue-400 flex-shrink-0" />
      <span className="text-[11px] font-medium text-blue-300 flex-1 truncate">{name}</span>
      <button
        onClick={onClear}
        className="nodrag p-0.5 text-blue-400/50 hover:text-blue-300 transition-colors flex-shrink-0"
      >
        <X size={9} />
      </button>
    </div>
  )
}

// ── Drop zone wrapper for every input ─────────────────────

function DropZone({
  value,
  onChange,
  children,
}: {
  value?: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const [dragOver, setDragOver] = useState(false)
  const str = value ?? ''
  const isVar = str.startsWith('{{') && str.endsWith('}}')
  const varName = isVar ? str.slice(2, -2) : null

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/variable')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    const name = e.dataTransfer.getData('application/variable')
    if (name) {
      e.preventDefault()
      e.stopPropagation()
      onChange(`{{${name}}}`)
    }
    setDragOver(false)
  }

  if (isVar && varName) {
    return <VariablePill name={varName} onClear={() => onChange('')} />
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`transition-all rounded-md ${
        dragOver ? 'ring-1 ring-blue-500/50 bg-blue-500/5' : ''
      }`}
    >
      {children}
    </div>
  )
}

// ── Connection info (when input is wired from another block or has "From source" from sourceOutputsFrom) ──

export type ConnectionInfo = {
  /** Set when there is an actual edge; unset for synthetic (sourceOutputsFrom) */
  edgeId?: string
  /** Source node id (for variable refs {{sourceNodeId.outputName}}) */
  sourceNodeId?: string
  sourceBlockLabel: string
  availableOutputs: Array<{ name: string; label: string }>
  /** Set when there is an edge (which output is selected); unset for synthetic */
  currentSourceHandle?: string
}

// ── Input type renderers ──────────────────────────────────

export type DataSourceOption = {
  nodeId: string
  nodeLabel: string
  outputs: Array<{ name: string; label: string }>
}

export interface BlockInputProps {
  field: InputField
  value?: string
  onChange: (val: string) => void
  color: BlockColor
  connectionInfo?: ConnectionInfo
  onSourceOutputChange?: (outputName: string) => void
  /** Execution-upstream nodes for "From upstream" source picker */
  availableDataSources?: DataSourceOption[]
  /** Set or clear data binding for this input (Manual vs From upstream) */
  onInputSourceChange?: (fieldName: string, binding: { sourceNodeId: string; outputName: string } | null) => void
  /** When true, do not show "From X:" above the dropdown (e.g. when "Connected to" is at node top) */
  hideSourceLabel?: boolean
  /** Optional suffix shown to the right of the input (e.g. "ETH", "USD") */
  suffix?: string
  /** When provided, suffix becomes clickable to toggle (e.g. Token ↔ USD) */
  onSuffixClick?: () => void
  /** When true, render only the input control (no label) for use inside source selector row */
  hideLabel?: boolean
}

function TextInput({ field, value = '', onChange, color, hideLabel }: BlockInputProps) {
  const focus = focusColorClass[color]
  const input = (
    <DropZone value={value} onChange={onChange}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={`${baseInput(focus)} px-2.5 py-1.5`}
      />
    </DropZone>
  )
  if (hideLabel) return <div className="flex flex-col gap-1">{input}</div>
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      {input}
    </div>
  )
}

function NumberInput({ field, value = '', onChange, color, suffix, onSuffixClick, hideLabel }: BlockInputProps) {
  const focus = focusColorClass[color]
  const suffixEl = suffix ? (
    onSuffixClick ? (
      <button
        type="button"
        onClick={onSuffixClick}
        className="nodrag flex-shrink-0 text-[10px] font-medium text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-700/50 transition-colors cursor-pointer"
      >
        {suffix}
      </button>
    ) : (
      <span className="flex-shrink-0 text-[10px] font-medium text-slate-500 px-2 py-1 rounded border border-slate-700 bg-slate-800/50">
        {suffix}
      </span>
    )
  ) : null
  const content = (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <DropZone value={value} onChange={onChange}>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            className={`${baseInput(focus)} px-2.5 py-1.5 w-full`}
          />
        </DropZone>
      </div>
      {suffixEl}
    </div>
  )
  if (hideLabel) return <div className="flex flex-col gap-1">{content}</div>
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      {content}
    </div>
  )
}

function SelectInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  const options = field.options ?? []
  if (field.optionDescriptions && Object.keys(field.optionDescriptions).length > 0) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
        <DropZone value={value} onChange={onChange}>
          <SelectWithOptionTooltips
            value={value}
            options={options}
            optionDescriptions={field.optionDescriptions}
            onChange={onChange}
            focusClass={focus}
            baseClass={baseInput(focus)}
          />
        </DropZone>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-7`}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </DropZone>
    </div>
  )
}

function ToggleInput({ field, value = '', onChange, color }: BlockInputProps) {
  const on = value === 'true'
  const accent = accentBgClass[color]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <button
          onClick={() => onChange(on ? 'false' : 'true')}
          className="nodrag flex items-center gap-2 group"
        >
          <div className={`w-8 h-[18px] rounded-full p-0.5 transition-colors ${on ? accent : 'bg-slate-700'}`}>
            <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[14px]' : 'translate-x-0'}`} />
          </div>
          <span className="text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors">
            {on ? 'Enabled' : 'Disabled'}
          </span>
        </button>
      </DropZone>
    </div>
  )
}

function TextareaInput({ field, value = '', onChange, color, hideLabel }: BlockInputProps) {
  const focus = focusColorClass[color]
  const input = (
    <DropZone value={value} onChange={onChange}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={field.rows ?? 3}
        className={`${baseInput(focus)} px-2.5 py-1.5 resize-none`}
      />
    </DropZone>
  )
  if (hideLabel) return <div className="flex flex-col gap-1">{input}</div>
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      {input}
    </div>
  )
}

function AddressInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <div className="relative flex items-center">
          <Wallet size={12} className="absolute left-2.5 text-slate-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? '0x...'}
            className={`${baseInput(focus)} pl-8 pr-3 py-1.5 font-mono`}
          />
        </div>
      </DropZone>
    </div>
  )
}

function WalletAddressInput({ field, color }: BlockInputProps) {
  const walletAddress = useWalletAddress()
  const { login } = usePrivy()
  const accent = accentBgClass[color]

  if (walletAddress) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
        <div className="nodrag flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/80 border border-slate-700 rounded-md">
          <Wallet size={12} className="text-slate-500 flex-shrink-0" />
          <span className="text-[11px] font-mono text-slate-300 truncate" title={walletAddress}>
            {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <button
        type="button"
        onClick={login}
        className={`nodrag w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white rounded-md transition-colors ${accent} hover:opacity-90`}
      >
        <Wallet size={14} />
        Connect Wallet
      </button>
    </div>
  )
}

function SliderInput({ field, value = '', onChange, color }: BlockInputProps) {
  const min = field.min ?? 0
  const max = field.max ?? 100
  const step = field.step ?? 1
  const accent = accentBgClass[color]
  const numValue = Number(value) || min

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <div className="flex flex-col gap-1.5">
          <div className="relative h-4 flex items-center">
            <div className="absolute inset-x-0 h-1 bg-slate-700 rounded-full" />
            <div
              className={`absolute left-0 h-1 ${accent} rounded-full`}
              style={{ width: `${((numValue - min) / (max - min)) * 100}%` }}
            />
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={numValue}
              onChange={(e) => onChange(e.target.value)}
              className="nodrag relative w-full h-4 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:border-0"
            />
          </div>
          <div className="flex justify-between">
            <span className="text-[9px] text-slate-600">{min}</span>
            <span className="text-[10px] font-medium text-slate-300">{numValue}</span>
            <span className="text-[9px] text-slate-600">{max}</span>
          </div>
        </div>
      </DropZone>
    </div>
  )
}

function TokenSelectInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  const tokens = field.tokens ?? DEFAULT_TOKENS

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-7`}
          >
            {tokens.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </DropZone>
    </div>
  )
}

function KeyValueInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  const pairs: [string, string][] = (() => {
    try { return JSON.parse(value || '[]') }
    catch { return [] }
  })()

  const updatePairs = useCallback(
    (next: [string, string][]) => onChange(JSON.stringify(next)),
    [onChange],
  )

  const addPair = () => updatePairs([...pairs, ['', '']])
  const removePair = (index: number) => updatePairs(pairs.filter((_, i) => i !== index))
  const updateKey = (index: number, key: string) => updatePairs(pairs.map((p, i) => (i === index ? [key, p[1]] : p)))
  const updateVal = (index: number, val: string) => updatePairs(pairs.map((p, i) => (i === index ? [p[0], val] : p)))

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      {pairs.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1">
          <input type="text" value={k} onChange={(e) => updateKey(i, e.target.value)} placeholder="Key" className={`${baseInput(focus)} px-2 py-1 flex-1 min-w-0`} />
          <input type="text" value={v} onChange={(e) => updateVal(i, e.target.value)} placeholder="Value" className={`${baseInput(focus)} px-2 py-1 flex-1 min-w-0`} />
          <button onClick={() => removePair(i)} className="nodrag p-1 text-slate-600 hover:text-rose-400 transition-colors flex-shrink-0">
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={addPair}
        className="nodrag flex items-center justify-center gap-1 py-1 text-[10px] text-slate-500 hover:text-slate-300 border border-dashed border-slate-700 hover:border-slate-600 rounded-md transition-colors"
      >
        <Plus size={10} />
        Add pair
      </button>
    </div>
  )
}

// ── Text input with "From source" dropdown (synthetic connectionInfo: sourceNodeId, no edge) ──

function TextInputWithSourceDropdown({
  field,
  value = '',
  onChange,
  connectionInfo,
  color,
  hideSourceLabel = false,
}: BlockInputProps & { connectionInfo: ConnectionInfo }) {
  const focus = focusColorClass[color]
  const { sourceNodeId, sourceBlockLabel, availableOutputs } = connectionInfo
  const insertVariable = (outputName: string) => {
    if (!sourceNodeId) return
    const ref = `{{${sourceNodeId}.${outputName}}}`
    onChange(ref)
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <div className="flex flex-col gap-0.5">
        {!hideSourceLabel && sourceBlockLabel && (
          <span className="text-[9px] text-slate-500">From source ({sourceBlockLabel}):</span>
        )}
        <div className="flex flex-col gap-1">
          <DropZone value={value} onChange={onChange}>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className={`${baseInput(focus)} px-2.5 py-1.5`}
            />
          </DropZone>
          <div className="relative">
            <select
              onChange={(e) => {
                const name = e.target.value
                if (name) insertVariable(name)
                e.target.value = ''
              }}
              className={`nodrag ${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-7 text-[11px]`}
              defaultValue=""
            >
              <option value="">Pick an output to use…</option>
              {availableOutputs.map((o) => (
                <option key={o.name} value={o.name}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Connected input (dropdown to pick which output flows) ──

function ConnectedInputDropdown({
  field,
  connectionInfo,
  onSourceOutputChange,
  color,
  hideSourceLabel = false,
}: {
  field: InputField
  connectionInfo: ConnectionInfo
  onSourceOutputChange: (outputName: string) => void
  color: BlockColor
  hideSourceLabel?: boolean
}) {
  const focus = focusColorClass[color]
  const { availableOutputs, sourceBlockLabel, currentSourceHandle } = connectionInfo
  const safeValue =
    currentSourceHandle != null && availableOutputs.some((o) => o.name === currentSourceHandle)
      ? currentSourceHandle
      : (availableOutputs[0]?.name ?? '')
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <div className="flex flex-col gap-0.5">
        {!hideSourceLabel && <span className="text-[9px] text-slate-500">From {sourceBlockLabel}:</span>}
        <div className="relative">
          <select
            value={safeValue}
            onChange={(e) => onSourceOutputChange(e.target.value)}
            className={`nodrag ${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-7`}
          >
            {availableOutputs.map((o) => (
              <option key={o.name} value={o.name}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>
    </div>
  )
}

// ── Connected input with literal override (dropdown + text/textarea/number so user can type) ──

function ConnectedInputWithLiteral({
  field,
  value = '',
  onChange,
  connectionInfo,
  onSourceOutputChange,
  color,
  hideSourceLabel = false,
}: BlockInputProps & { connectionInfo: ConnectionInfo; onSourceOutputChange: (outputName: string) => void }) {
  const focus = focusColorClass[color]
  const { availableOutputs, sourceBlockLabel, currentSourceHandle } = connectionInfo
  const safeValue =
    currentSourceHandle != null && availableOutputs.some((o) => o.name === currentSourceHandle)
      ? currentSourceHandle
      : (availableOutputs[0]?.name ?? '')
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <div className="flex flex-col gap-1">
        {!hideSourceLabel && <span className="text-[9px] text-slate-500">From {sourceBlockLabel}:</span>}
        <div className="relative">
          <select
            value={safeValue}
            onChange={(e) => onSourceOutputChange(e.target.value)}
            className={`nodrag ${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-7`}
          >
            {availableOutputs.map((o) => (
              <option key={o.name} value={o.name}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
        <span className="text-[9px] text-slate-500">Or type:</span>
        <DropZone value={value} onChange={onChange}>
          {field.type === 'textarea' ? (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              rows={field.rows ?? 2}
              className={`nodrag ${baseInput(focus)} px-2.5 py-1.5 resize-none`}
            />
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.step}
              className={`nodrag ${baseInput(focus)} px-2.5 py-1.5`}
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              className={`nodrag ${baseInput(focus)} px-2.5 py-1.5`}
            />
          )}
        </DropZone>
      </div>
    </div>
  )
}

// ── Dispatcher ────────────────────────────────────────────

const renderers: Record<string, React.FC<BlockInputProps>> = {
  text: TextInput,
  number: NumberInput,
  select: SelectInput,
  toggle: ToggleInput,
  textarea: TextareaInput,
  address: AddressInput,
  walletAddress: WalletAddressInput,
  slider: SliderInput,
  tokenSelect: TokenSelectInput,
  keyValue: KeyValueInput,
}

const CONNECTED_TYPES_WITH_LITERAL = ['text', 'textarea', 'number']

function isConnectable(field: InputField): boolean {
  if (field.type === 'walletAddress') return false
  return !!(field.allowVariable || (field.accepts && field.accepts.length > 0))
}

const SOURCE_POPOVER_Z = 2147483647

function SourceCirclePopover({
  open,
  onOpenChange,
  onManual,
  onSelectSource,
  availableDataSources = [],
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onManual: () => void
  /** When user picks a connected source: (nodeId, outputName) — use first output if single. */
  onSelectSource?: (nodeId: string, outputName: string) => void
  availableDataSources?: DataSourceOption[]
  children: React.ReactNode
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const update = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setMenuPosition({
          top: rect.bottom + 4,
          left: Math.max(4, rect.right - 200),
        })
      }
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const menuContent = open && (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: SOURCE_POPOVER_Z - 1 }}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className="fixed min-w-[200px] max-w-[280px] py-1 rounded-md border border-slate-600 bg-slate-900 shadow-2xl"
        style={{
          zIndex: SOURCE_POPOVER_Z,
          top: menuPosition.top,
          left: menuPosition.left,
        }}
      >
        <button
          type="button"
          onClick={() => { onManual(); onOpenChange(false) }}
          className="nodrag w-full text-left px-2.5 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700"
        >
          Manual
        </button>
        {availableDataSources.length > 0 &&
          availableDataSources.map((src, i) => {
            const firstOutput = src.outputs[0]?.name ?? 'value'
            return (
              <button
                key={src.nodeId}
                type="button"
                onClick={() => {
                  onSelectSource?.(src.nodeId, firstOutput)
                  onOpenChange(false)
                }}
                className="nodrag w-full text-left px-2.5 py-1.5 text-[11px] text-blue-400 hover:bg-slate-800 font-mono truncate"
                title={src.nodeId}
              >
                {i + 1}. {src.nodeLabel} <span className="text-slate-500">({src.nodeId})</span>
              </button>
            )
          })}
      </div>
    </>
  )

  return (
    <div className="relative flex items-center min-w-0 flex-1">
      {children}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
        <div className="pointer-events-auto relative" style={{ zIndex: SOURCE_POPOVER_Z }}>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => onOpenChange(!open)}
            className="nodrag flex items-center justify-center w-5 h-5 rounded-full border border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors"
            title="Input source"
          >
            <Circle size={10} fill="currentColor" />
          </button>
          {typeof document !== 'undefined' && createPortal(menuContent, document.body)}
        </div>
      </div>
    </div>
  )
}

function InputWithSourceSelector(props: BlockInputProps) {
  const { field, availableDataSources = [], onInputSourceChange, connectionInfo } = props
  const hasBinding = !!connectionInfo?.sourceNodeId
  const mode: 'manual' | 'upstream' = hasBinding ? 'upstream' : 'manual'
  const [modeOpen, setModeOpen] = useState(false)
  const focus = focusColorClass[props.color]
  const setManual = useCallback(() => {
    onInputSourceChange?.(field.name, null)
  }, [field.name, onInputSourceChange])
  const onSelectSource = useCallback(
    (nodeId: string, outputName: string) => {
      onInputSourceChange?.(field.name, { sourceNodeId: nodeId, outputName })
    },
    [field.name, onInputSourceChange],
  )
  const Renderer = renderers[field.type] ?? TextInput

  const showCircle = availableDataSources.length > 0 || hasBinding
  const labelRow = (
    <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider shrink-0">
      {field.label}
    </label>
  )

  if (mode === 'upstream' && connectionInfo && props.onSourceOutputChange) {
    const { availableOutputs, currentSourceHandle } = connectionInfo
    const safeValue =
      currentSourceHandle != null && availableOutputs.some((o) => o.name === currentSourceHandle)
        ? currentSourceHandle
        : (availableOutputs[0]?.name ?? '')
    const sourceIndex = connectionInfo.sourceNodeId
      ? availableDataSources.findIndex((s) => s.nodeId === connectionInfo.sourceNodeId) + 1
      : 0
    const outputLabel = (o: { name: string; label: string }) =>
      sourceIndex ? `${sourceIndex}. ${o.label}` : o.label
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {labelRow}
          <SourceCirclePopover
            open={modeOpen}
            onOpenChange={setModeOpen}
            onManual={setManual}
            onSelectSource={onSelectSource}
            availableDataSources={availableDataSources}
          >
            <div className="relative flex-1 min-w-0 pr-7">
              <select
                value={safeValue}
                onChange={(e) => props.onSourceOutputChange?.(e.target.value)}
                className={`nodrag w-full ${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-2`}
              >
                {availableOutputs.map((o) => (
                  <option key={o.name} value={o.name}>{outputLabel(o)}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </SourceCirclePopover>
        </div>
      </div>
    )
  }

  // Upstream with a source selected but no output selector (e.g. Output Display: choose source only; fields chosen elsewhere)
  if (mode === 'upstream' && connectionInfo && !props.onSourceOutputChange) {
    const sourceIndex = connectionInfo.sourceNodeId
      ? availableDataSources.findIndex((s) => s.nodeId === connectionInfo.sourceNodeId) + 1
      : 0
    const sourceLabel = connectionInfo.sourceBlockLabel
      ? (sourceIndex ? `${sourceIndex}. ${connectionInfo.sourceBlockLabel}` : connectionInfo.sourceBlockLabel)
      : 'Source'
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {labelRow}
          <SourceCirclePopover
            open={modeOpen}
            onOpenChange={setModeOpen}
            onManual={setManual}
            onSelectSource={onSelectSource}
            availableDataSources={availableDataSources}
          >
            <div
              className={`flex-1 min-w-0 pr-7 flex items-center px-2.5 py-1.5 rounded border bg-slate-800/50 border-slate-600 text-slate-300 text-xs truncate ${focus}`}
              title={sourceLabel}
            >
              {sourceLabel}
            </div>
          </SourceCirclePopover>
        </div>
      </div>
    )
  }

  if (mode === 'manual' && showCircle) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {labelRow}
          <SourceCirclePopover
            open={modeOpen}
            onOpenChange={setModeOpen}
            onManual={setManual}
            onSelectSource={onSelectSource}
            availableDataSources={availableDataSources}
          >
            <div className="flex-1 min-w-0 pr-7">
              <Renderer {...props} hideLabel />
            </div>
          </SourceCirclePopover>
        </div>
      </div>
    )
  }

  if (mode === 'manual') return <Renderer {...props} />

  if (mode === 'upstream' && availableDataSources.length > 0 && !connectionInfo) {
    const options: { value: string; nodeId: string; outputName: string; label: string }[] = []
    availableDataSources.forEach((src, i) => {
      const num = i + 1
      for (const out of src.outputs) {
        options.push({
          value: `${src.nodeId}:${out.name}`,
          nodeId: src.nodeId,
          outputName: out.name,
          label: `${num}. ${src.nodeLabel} → ${out.label}`,
        })
      }
    })
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {labelRow}
          <SourceCirclePopover
            open={modeOpen}
            onOpenChange={setModeOpen}
            onManual={setManual}
            onSelectSource={onSelectSource}
            availableDataSources={availableDataSources}
          >
            <div className="relative flex-1 min-w-0 pr-7">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  const opt = options.find((o) => o.value === v)
                  if (opt) onInputSourceChange?.(field.name, { sourceNodeId: opt.nodeId, outputName: opt.outputName })
                  e.target.value = ''
                }}
                className={`nodrag w-full ${baseInput(focus)} appearance-none cursor-pointer px-2.5 py-1.5 pr-2`}
              >
                <option value="">Select source…</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </SourceCirclePopover>
        </div>
      </div>
    )
  }

  return <Renderer {...props} />
}

export default function BlockInput(props: BlockInputProps) {
  if (isConnectable(props.field) && props.onInputSourceChange && ((props.availableDataSources?.length ?? 0) > 0 || props.connectionInfo?.sourceNodeId)) {
    return <InputWithSourceSelector {...props} />
  }
  if (
    props.connectionInfo != null &&
    props.connectionInfo.edgeId != null &&
    props.onSourceOutputChange != null &&
    props.field.type !== 'walletAddress'
  ) {
    const allowLiteral =
      CONNECTED_TYPES_WITH_LITERAL.includes(props.field.type) &&
      (props.field.allowVariable !== false)
    if (allowLiteral) {
      return (
        <ConnectedInputWithLiteral
          {...props}
          connectionInfo={props.connectionInfo}
          onSourceOutputChange={props.onSourceOutputChange}
          hideSourceLabel={props.hideSourceLabel}
        />
      )
    }
    return (
      <ConnectedInputDropdown
        field={props.field}
        connectionInfo={props.connectionInfo}
        onSourceOutputChange={props.onSourceOutputChange}
        color={props.color}
        hideSourceLabel={props.hideSourceLabel}
      />
    )
  }
  // Synthetic connectionInfo (sourceOutputsFrom): "From source" dropdown that inserts {{nodeId.outputName}}
  if (
    props.connectionInfo != null &&
    props.connectionInfo.sourceNodeId != null &&
    props.connectionInfo.edgeId == null &&
    props.field.type === 'text' &&
    props.field.allowVariable !== false
  ) {
    return (
      <TextInputWithSourceDropdown
        {...props}
        connectionInfo={props.connectionInfo}
        hideSourceLabel={props.hideSourceLabel}
      />
    )
  }
  const Renderer = renderers[props.field.type] ?? TextInput
  return <Renderer {...props} />
}
