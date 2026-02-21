import { Braces, ChevronDown, Wallet, Plus, X } from 'lucide-react'
import { useCallback, useState, type DragEvent } from 'react'
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

// ── Connection info (when input is wired from another block) ──

export type ConnectionInfo = {
  edgeId: string
  sourceBlockLabel: string
  availableOutputs: Array<{ name: string; label: string }>
  currentSourceHandle: string
}

// ── Input type renderers ──────────────────────────────────

export interface BlockInputProps {
  field: InputField
  value?: string
  onChange: (val: string) => void
  color: BlockColor
  connectionInfo?: ConnectionInfo
  onSourceOutputChange?: (outputName: string) => void
  /** When true, do not show "From X:" above the dropdown (e.g. when "Connected to" is at node top) */
  hideSourceLabel?: boolean
  /** Optional suffix shown to the right of the input (e.g. "ETH", "USD") */
  suffix?: string
  /** When provided, suffix becomes clickable to toggle (e.g. Token ↔ USD) */
  onSuffixClick?: () => void
}

function TextInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${baseInput(focus)} px-2.5 py-1.5`}
        />
      </DropZone>
    </div>
  )
}

function NumberInput({ field, value = '', onChange, color, suffix, onSuffixClick }: BlockInputProps) {
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
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
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

function TextareaInput({ field, value = '', onChange, color }: BlockInputProps) {
  const focus = focusColorClass[color]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{field.label}</label>
      <DropZone value={value} onChange={onChange}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows ?? 3}
          className={`${baseInput(focus)} px-2.5 py-1.5 resize-none`}
        />
      </DropZone>
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
    availableOutputs.some((o) => o.name === currentSourceHandle)
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
    availableOutputs.some((o) => o.name === currentSourceHandle)
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

export default function BlockInput(props: BlockInputProps) {
  if (
    props.connectionInfo != null &&
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
  const Renderer = renderers[props.field.type] ?? TextInput
  return <Renderer {...props} />
}
