import { useState, useEffect } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useCallStore } from '../../store/useCallStore'

export function SuggestionDrawer(): React.ReactElement {
  const liveInsight = useCallStore((s) => s.liveInsight)
  const [expanded, setExpanded] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (liveInsight && liveInsight.intent.confidence >= 0.3) {
      setVisible(true)
      setExpanded(true)
    }
  }, [liveInsight?.timestamp])

  if (!visible || !liveInsight || liveInsight.intent.confidence < 0.3) {
    return (
      <div
        className="absolute flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-all hover:bg-white/5"
        style={{
          right: 32,
          bottom: 260,
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}
        onClick={() => setVisible(true)}
      >
        <Sparkles className="h-3.5 w-3.5 text-purple-400/60" />
        <span className="text-xs text-white/40">AI</span>
      </div>
    )
  }

  const { intent, classification } = liveInsight

  return (
    <div
      className="absolute transition-all duration-300"
      style={{
        right: 32,
        bottom: 260,
        width: 360,
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-white/70 uppercase tracking-wider">
            Suggested Response
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-white/30" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-white/30" />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Layer 1: What did they say */}
          {classification?.summary && (
            <div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
                What they said
              </div>
              <div className="text-sm text-white/70 italic">
                "{classification.summary}"
              </div>
            </div>
          )}

          {/* Layer 2: What does it mean */}
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
              What it means
            </div>
            <div className="flex items-center gap-2">
              <div
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{
                  background: getSentimentColor(intent.sentiment) + '22',
                  color: getSentimentColor(intent.sentiment)
                }}
              >
                {intent.type.replace(/_/g, ' ').toUpperCase()}
              </div>
              <span className="text-xs text-white/50">
                {Math.round(intent.confidence * 100)}% confidence
              </span>
            </div>
            {classification?.painPoints && classification.painPoints.length > 0 && (
              <div className="mt-1.5 text-xs text-orange-300/70">
                Pain: {classification.painPoints[0]}
              </div>
            )}
            {classification?.opportunities && classification.opportunities.length > 0 && (
              <div className="mt-1 text-xs text-green-300/70">
                Opportunity: {classification.opportunities[0]}
              </div>
            )}
          </div>

          {/* Layer 3: What should you do */}
          {classification?.suggestedFollowUp && (
            <div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
                What to say
              </div>
              <div
                className="text-sm text-white/90 leading-relaxed p-3 rounded-lg"
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.15)'
                }}
              >
                {classification.suggestedFollowUp}
              </div>
            </div>
          )}

          {/* Keywords */}
          {intent.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {intent.keywords.slice(0, 4).map((k, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-white/30"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case 'positive': return '#22c55e'
    case 'negative': return '#ef4444'
    default: return '#6b7280'
  }
}
