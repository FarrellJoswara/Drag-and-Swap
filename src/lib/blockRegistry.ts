import {
  Eye,
  Bell,
  Zap,
  Wallet,
  Shield,
  Filter,
  ArrowLeftRight,
  Activity,
  BarChart3,
  Braces,
  Clock,
  Globe,
  Send,
  Database,
  type LucideIcon,
} from 'lucide-react'

// ── Input field types ─────────────────────────────────────
//
// When defining a block, pick the input type that fits:
//   text         → single-line string
//   number       → numeric value
//   select       → dropdown with fixed options
//   toggle       → on / off switch
//   textarea     → multi-line text
//   address      → wallet address (mono font, icon)
//   slider       → range with min / max / step
//   tokenSelect  → rich token picker for DeFi tokens
//   variable     → dropdown referencing outputs from other blocks
//   keyValue     → dynamic list of key/value pairs

export type InputFieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'toggle'
  | 'textarea'
  | 'address'
  | 'walletAddress'
  | 'slider'
  | 'tokenSelect'
  | 'variable'
  | 'keyValue'

export interface InputField {
  name: string
  label: string
  type: InputFieldType
  placeholder?: string
  options?: string[]
  defaultValue?: string
  allowVariable?: boolean
  min?: number
  max?: number
  step?: number
  rows?: number
  tokens?: string[]
  /** Array of accepted output types for connection validation */
  accepts?: string[]
  /** Optional map of option value -> description for select dropdowns (hover tooltips) */
  optionDescriptions?: Record<string, string>
}

export interface OutputField {
  name: string
  label: string
  /** Optional type hint for connection validation and UI display */
  type?: 'string' | 'number' | 'address' | 'json' | 'boolean'
}

export type BlockCategory = 'trigger' | 'action' | 'filter' | 'display'
export type BlockColor = 'violet' | 'amber' | 'emerald' | 'blue' | 'rose' | 'yellow'
export type BlockService = 'quicknode' | 'hyperliquid' | 'uniswap'

/** Called when an interrupt-based trigger fires. */
export type TriggerCallback = (outputs: Record<string, string>) => void

/** Cleanup function returned by subscribe. */
export type Unsubscribe = () => void

export interface BlockDefinition {
  type: string
  label: string
  description: string
  /** Primary category. Use categories for blocks that appear in multiple sections. */
  category: BlockCategory
  /** If set, block appears in each listed category (e.g. ethBalance in trigger + action). */
  categories?: BlockCategory[]
  color: BlockColor
  icon: string
  /** Service folder (quicknode, hyperliquid, uniswap). Omit for general blocks. */
  service?: BlockService
  inputs: InputField[]
  outputs: OutputField[]
  /** When set, outputs depend on current inputs (e.g. stream type). Use getOutputsForBlock(blockType, node.data) to resolve. */
  getOutputs?: (inputs: Record<string, string>) => OutputField[]
  /** When set, block uses side-panel layout: inputs in mainInputNames go in main card, rest in side panel */
  sidePanel?: { label: string; mainInputNames: string[] }
  run: (inputs: Record<string, string>, context?: import('./runAgent').RunContext) => Promise<Record<string, string>>
  /** Interrupt-based: subscribe to events, call onTrigger when they occur. Returns cleanup. */
  subscribe?: (inputs: Record<string, string>, onTrigger: TriggerCallback) => Unsubscribe
}

// ── Registry ──────────────────────────────────────────────

const registry = new Map<string, BlockDefinition>()

export function registerBlock(def: BlockDefinition) {
  registry.set(def.type, def)
}

export function getBlock(type: string) {
  return registry.get(type)
}

export function getAllBlocks() {
  return Array.from(registry.values())
}

export function getBlocksByCategory(category: BlockCategory) {
  return getAllBlocks().filter((b) => {
    if (b.categories) return b.categories.includes(category)
    return b.category === category
  })
}

/** Group blocks by service within a category. Returns { serviceName: blocks[] } and general blocks. */
export function getBlocksByCategoryGroupedByService(category: BlockCategory) {
  const blocks = getBlocksByCategory(category)
  const byService: Record<string, BlockDefinition[]> = {}
  const general: BlockDefinition[] = []

  for (const block of blocks) {
    if (block.service) {
      const key = block.service
      if (!byService[key]) byService[key] = []
      byService[key].push(block)
    } else {
      general.push(block)
    }
  }

  return { byService, general }
}

/** Returns a flat list of every output across all registered blocks. */
export function getAllOutputOptions() {
  const options: { blockType: string; blockLabel: string; output: OutputField }[] = []
  for (const block of registry.values()) {
    for (const out of block.outputs) {
      options.push({ blockType: block.type, blockLabel: block.label, output: out })
    }
  }
  return options
}

/**
 * Resolve outputs for a block given its current node data (e.g. for dynamic outputs by stream type).
 * Uses getOutputs(inputs) when defined, otherwise returns definition.outputs.
 */
export function getOutputsForBlock(
  blockType: string,
  nodeData: Record<string, unknown>,
): OutputField[] {
  const def = registry.get(blockType)
  if (!def) return []
  const inputs: Record<string, string> = {}
  for (const [k, v] of Object.entries(nodeData ?? {})) {
    inputs[k] = v != null ? String(v) : ''
  }
  if (def.getOutputs) return def.getOutputs(inputs)
  return def.outputs
}

// ── Icon map ──────────────────────────────────────────────

const iconMap: Record<string, LucideIcon> = {
  eye: Eye,
  bell: Bell,
  zap: Zap,
  wallet: Wallet,
  shield: Shield,
  filter: Filter,
  arrowLeftRight: ArrowLeftRight,
  activity: Activity,
  barChart: BarChart3,
  braces: Braces,
  clock: Clock,
  globe: Globe,
  send: Send,
  database: Database,
}

export function getBlockIcon(name: string): LucideIcon {
  return iconMap[name] ?? Activity
}

// ── Color maps ────────────────────────────────────────────

export const iconColorClass: Record<BlockColor, string> = {
  violet: 'text-violet-400',
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  rose: 'text-rose-400',
  yellow: 'text-yellow-400',
}

export const focusColorClass: Record<BlockColor, string> = {
  violet: 'focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30',
  amber: 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30',
  emerald: 'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30',
  blue: 'focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
  rose: 'focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30',
  yellow: 'focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/30',
}

export const accentBgClass: Record<BlockColor, string> = {
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  rose: 'bg-rose-500',
  yellow: 'bg-yellow-500',
}

export const sidebarColorClasses: Record<
  BlockColor,
  { bg: string; text: string; border: string }
> = {
  violet: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/20 hover:border-violet-500/50',
  },
  amber: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20 hover:border-amber-500/50',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20 hover:border-emerald-500/50',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20 hover:border-blue-500/50',
  },
  rose: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20 hover:border-rose-500/50',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20 hover:border-yellow-500/50',
  },
}

export const minimapColor: Record<BlockColor, string> = {
  violet: '#7c3aed',
  amber: '#d97706',
  emerald: '#059669',
  blue: '#3b82f6',
  rose: '#f43f5e',
  yellow: '#eab308',
}

// ── Common token list ─────────────────────────────────────
// Only the ones supported by the uniswap block

export const DEFAULT_TOKENS = [
  'ETH', 'USDC', 'USDT', 'WBTC', 'DAI', 'ARB', 'LINK', 'UNI', 'MATIC',
]
