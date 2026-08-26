import { useState, useEffect } from 'react'
import { Brain, Lightbulb, Target, TrendingUp } from 'lucide-react'
import { useCallStore } from '../store/useCallStore'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const INTENT_ICONS: Record<string, React.ReactNode> = {
  question: <Lightbulb className="h-4 w-4" />,
  objection: <Target className="h-4 w-4" />,
  pain_point: <Target className="h-4 w-4" />,
  buying_signal: <TrendingUp className="h-4 w-4" />,
  competitor_mention: <Target className="h-4 w-4" />,
  pricing_discussion: <Target className="h-4 w-4" />,
  feature_request: <Lightbulb className="h-4 w-4" />,
  closing_signal: <TrendingUp className="h-4 w-4" />
}

const INTENT_LABELS: Record<string, string> = {
  question: 'Question',
  objection: 'Objection',
  pain_point: 'Pain Point',
  buying_signal: 'Buying Signal',
  competitor_mention: 'Competitor Mention',
  pricing_discussion: 'Pricing Discussion',
  feature_request: 'Feature Request',
  small_talk: 'Small Talk',
  closing_signal: 'Closing Signal',
  general: 'General'
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-400',
  neutral: 'text-muted-foreground',
  negative: 'text-orange-400'
}

export function LiveInsightDisplay(): React.ReactElement {
  const liveInsight = useCallStore((s) => s.liveInsight)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!liveInsight) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 300)
    return () => clearTimeout(t)
  }, [liveInsight?.timestamp])

  if (!liveInsight) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Brain className="h-4 w-4 animate-pulse" />
            Listening for intent...
          </div>
        </CardContent>
      </Card>
    )
  }

  const { intent, classification } = liveInsight

  return (
    <Card className={`transition-all duration-200 ${flash ? 'ring-2 ring-primary/50' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {INTENT_ICONS[intent.type] || <Brain className="h-4 w-4" />}
          <span>{INTENT_LABELS[intent.type] || intent.type}</span>
          <span className={`text-xs font-normal ${SENTIMENT_COLORS[intent.sentiment]}`}>
            {intent.sentiment}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {Math.round(intent.confidence * 100)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {classification?.summary && (
          <p className="text-muted-foreground">{classification.summary}</p>
        )}

        {classification?.painPoints && classification.painPoints.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-orange-400 mb-1">Pain Points</div>
            <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
              {classification.painPoints.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {classification?.opportunities && classification.opportunities.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-400 mb-1">Opportunities</div>
            <ul className="list-disc list-inside text-muted-foreground text-xs space-y-0.5">
              {classification.opportunities.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          </div>
        )}

        {classification?.suggestedFollowUp && (
          <div className="rounded-md bg-muted p-2 text-xs">
            <div className="text-xs font-semibold text-primary mb-1">Suggested Response</div>
            <p className="text-muted-foreground">{classification.suggestedFollowUp}</p>
          </div>
        )}

        {intent.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {intent.keywords.map((k, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                {k}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
