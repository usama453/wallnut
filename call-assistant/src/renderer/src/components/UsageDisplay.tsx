import type { UsageSnapshot } from '@shared/types'
import { cn } from '../lib/cn'

interface UsageDisplayProps {
  usage: UsageSnapshot | null
  className?: string
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function UsageDisplay({ usage, className }: UsageDisplayProps): React.ReactElement {
  if (!usage) {
    return (
      <div className={cn('flex items-center gap-3 text-xs text-muted-foreground', className)}>
        <span>No usage yet</span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', className)}>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Session:</span>
        <span className="font-medium tabular-nums">{formatTokens(usage.session.totalTokens)}</span>
        <span className="text-muted-foreground">tokens</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Total:</span>
        <span className="font-medium tabular-nums">{formatTokens(usage.total.totalTokens)}</span>
        <span className="text-muted-foreground">tokens</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Cost:</span>
        <span className="font-medium tabular-nums">{formatCost(usage.estimatedCostUsd)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Model:</span>
        <span className="font-medium">{usage.model}</span>
      </div>
    </div>
  )
}
