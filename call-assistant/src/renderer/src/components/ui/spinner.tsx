import { cn } from '../../lib/cn'

export function Spinner({ className }: { className?: string }): React.ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary',
        className
      )}
    />
  )
}
