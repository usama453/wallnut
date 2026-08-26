import { Lightbulb, MessageSquareText, ShieldAlert, Info, FileText, HelpCircle } from 'lucide-react'
import { cn } from '../lib/cn'
import { Badge } from './ui/badge'
import { Card, CardContent } from './ui/card'
import type { AssistantSuggestion, SuggestionType } from '@shared/types'

const TYPE_META: Record<SuggestionType, { label: string; icon: typeof Lightbulb; badge: 'info' | 'warning' | 'default' | 'success' }> = {
  answer: { label: 'Answer', icon: MessageSquareText, badge: 'default' },
  suggestion: { label: 'Suggestion', icon: Lightbulb, badge: 'info' },
  clarification: { label: 'Clarify', icon: HelpCircle, badge: 'warning' },
  warning: { label: 'Warning', icon: ShieldAlert, badge: 'warning' },
  information: { label: 'Info', icon: Info, badge: 'info' },
  summary: { label: 'Summary', icon: FileText, badge: 'success' }
}

const PRIORITY_BORDER: Record<string, string> = {
  high: 'border-l-destructive',
  medium: 'border-l-amber-400',
  low: 'border-l-primary'
}

export function SuggestionCard({
  suggestion,
  emptyHint
}: {
  suggestion: AssistantSuggestion | null
  emptyHint?: string
}): React.ReactElement {
  if (!suggestion) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <Lightbulb className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {emptyHint ?? 'Suggestions from the AI assistant will appear here.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const meta = TYPE_META[suggestion.type ?? 'suggestion']
  const Icon = meta.icon

  return (
    <Card className={cn('border-l-4', PRIORITY_BORDER[suggestion.priority ?? 'medium'] ?? '')}>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {meta.label}
            </span>
          </div>
          {suggestion.priority ? (
            <Badge variant={meta.badge} className="capitalize">
              {suggestion.priority}
            </Badge>
          ) : null}
        </div>
        {suggestion.title ? (
          <div className="font-medium leading-snug">{suggestion.title}</div>
        ) : null}
        {suggestion.content ? (
          <p className="text-sm leading-relaxed text-foreground/90">{suggestion.content}</p>
        ) : null}
        {suggestion.reason ? (
          <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
