'use client'

/**
 * MessageBubble - Vercel AI Chat Inspired
 *
 * Design Philosophy:
 * - Almost monochromatic - grays dominate
 * - Color only for status indicators
 * - Compact, tight spacing
 * - Angular but soft borders
 * - Typography-first, minimal chrome
 */

import React, { memo } from 'react'
import { Check, CheckCheck, Clock, AlertCircle, Sparkles, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/date-utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { InboxMessage, DeliveryStatus, Sentiment } from '@/types'
import { WhatsAppFormattedText } from '@/lib/whatsapp-text-formatter'

export interface MessageBubbleProps {
  message: InboxMessage
  /** Name of the AI agent for displaying in AI responses */
  agentName?: string
  /** Whether this is the first message in a group from same sender */
  isFirstInGroup?: boolean
  /** Whether this is the last message in a group from same sender */
  isLastInGroup?: boolean
}

// Delivery status - ultra minimal
function DeliveryStatusIcon({ status }: { status: DeliveryStatus }) {
  const base = 'h-2.5 w-2.5'
  switch (status) {
    case 'pending':
      return <Clock className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'sent':
      return <Check className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'delivered':
      return <CheckCheck className={cn(base, 'text-[var(--ds-text-muted)]')} />
    case 'read':
      return <CheckCheck className={cn(base, 'text-blue-400')} />
    case 'failed':
      return <AlertCircle className={cn(base, 'text-red-400')} />
    default:
      return null
  }
}

// Sentiment - subtle underline indicator
function SentimentIndicator({ sentiment }: { sentiment: Sentiment }) {
  const colors: Record<Sentiment, string> = {
    positive: 'bg-emerald-500/60',
    neutral: 'bg-[var(--ds-text-muted)]/60',
    negative: 'bg-amber-500/60',
    frustrated: 'bg-red-500/60',
  }
  const labels: Record<Sentiment, string> = {
    positive: 'Positivo',
    neutral: 'Neutro',
    negative: 'Negativo',
    frustrated: 'Frustrado',
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('w-1 h-1 rounded-full', colors[sentiment])} />
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {labels[sentiment]}
      </TooltipContent>
    </Tooltip>
  )
}

// Check if message is a handoff/system message
function isHandoffMessage(content: string): boolean {
  return content.includes('**Transferência') || content.includes('**Motivo:**')
}

// Parse handoff message into structured data
function parseHandoffMessage(content: string): { title: string; reason: string; summary: string } | null {
  if (!isHandoffMessage(content)) return null

  const reasonMatch = content.match(/\*\*Motivo:\*\*\s*(.+?)(?=\n|$)/s)
  const summaryMatch = content.match(/\*\*Resumo:\*\*\s*(.+?)(?=\n|$)/s)

  return {
    title: 'Transferido para humano',
    reason: reasonMatch?.[1]?.trim() || '',
    summary: summaryMatch?.[1]?.trim() || '',
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  agentName,
  isFirstInGroup = true,
  isLastInGroup = true,
}: MessageBubbleProps) {
  const {
    direction,
    content,
    delivery_status,
    created_at,
    ai_sentiment,
    ai_sources,
  } = message

  const isInbound = direction === 'inbound'
  const isAIResponse = !isInbound && (message.ai_response_id || ai_sources)
  const handoffData = parseHandoffMessage(content)

  // Format time
  const time = formatTime(created_at)

  // Special rendering for handoff messages - system message style
  if (handoffData) {
    const hasDetails = handoffData.reason || handoffData.summary

    return (
      <div className="flex justify-center my-3 animate-in fade-in duration-150">
        <div className={cn(
          'bg-[var(--ds-bg-surface)]/50 border border-[var(--ds-border-subtle)]',
          hasDetails ? 'px-4 py-3 rounded-xl max-w-md' : 'px-4 py-2 rounded-full'
        )}>
          {/* Header */}
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500/70" />
            <span className="text-xs font-medium text-[var(--ds-text-secondary)]">{handoffData.title}</span>
            <span className="text-[10px] text-[var(--ds-text-muted)]">·</span>
            <span className="text-[10px] text-[var(--ds-text-muted)]">{time}</span>
          </div>

          {/* Details (if available) */}
          {hasDetails && (
            <div className="mt-2 pt-2 border-t border-[var(--ds-border-subtle)] space-y-1">
              {handoffData.reason && (
                <p className="text-xs text-[var(--ds-text-secondary)]">
                  <span className="text-[var(--ds-text-muted)]">Motivo:</span> {handoffData.reason}
                </p>
              )}
              {handoffData.summary && (
                <p className="text-xs text-[var(--ds-text-secondary)]">
                  <span className="text-[var(--ds-text-muted)]">Resumo:</span> {handoffData.summary}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Border radius - more angular, modern feel
  const getBorderRadius = () => {
    if (isInbound) {
      if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-bl-sm'
      if (isFirstInGroup) return 'rounded-2xl rounded-bl-md'
      if (isLastInGroup) return 'rounded-xl rounded-tl-md rounded-bl-sm'
      return 'rounded-xl rounded-l-md'
    } else {
      if (isFirstInGroup && isLastInGroup) return 'rounded-2xl rounded-br-sm'
      if (isFirstInGroup) return 'rounded-2xl rounded-br-md'
      if (isLastInGroup) return 'rounded-xl rounded-tr-md rounded-br-sm'
      return 'rounded-xl rounded-r-md'
    }
  }

  return (
    <div
      className={cn(
        'flex items-end gap-1.5 w-full',
        'animate-in fade-in duration-100',
        isInbound ? 'justify-start' : 'justify-end',
        // Spacing within and between groups
        !isLastInGroup && 'mb-0.5',
        isLastInGroup && 'mb-2'
      )}
    >
      <div className={cn(
        'flex flex-col max-w-[85%]',
        isInbound ? 'items-start' : 'items-end'
      )}>
        {/* Bubble - subtle colors */}
        <div
          className={cn(
            'relative px-3.5 py-2',
            getBorderRadius(),
            // Inbound (cliente): themed surface color
            isInbound && 'bg-[var(--ds-bg-surface)]/80 text-[var(--ds-text-primary)]',
            // Outbound humano: verde desaturado, elegante
            !isInbound && !isAIResponse && 'bg-emerald-600/80 text-white',
            // AI Response: verde mais escuro para diferenciar
            isAIResponse && 'bg-emerald-700/70 text-emerald-50'
          )}
        >
          {/* Message content with WhatsApp formatting */}
          <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
            <WhatsAppFormattedText text={content} />
          </p>

          {/* AI Sources - inline, minimal */}
          {isAIResponse && ai_sources && ai_sources.length > 0 && isLastInGroup && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-emerald-200/70 hover:text-emerald-100 transition-colors">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>{ai_sources.length} fontes</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <ul className="text-xs space-y-0.5 text-[var(--ds-text-secondary)]">
                  {ai_sources.map((source, i) => (
                    <li key={i} className="truncate">• {source.title}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Footer - only on last message of group */}
        {isLastInGroup && (
          <div className={cn(
            'flex items-center gap-1.5 mt-1 px-1',
            isInbound ? 'flex-row' : 'flex-row-reverse'
          )}>
            {/* Sentiment indicator */}
            {isInbound && ai_sentiment && (
              <SentimentIndicator sentiment={ai_sentiment as Sentiment} />
            )}

            <span className="text-[10px] text-[var(--ds-text-muted)]">{time}</span>

            {/* Delivery status */}
            {!isInbound && delivery_status && (
              <DeliveryStatusIcon status={delivery_status} />
            )}
          </div>
        )}
      </div>
    </div>
  )
})
