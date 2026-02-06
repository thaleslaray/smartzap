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

import React, { memo, useMemo } from 'react'
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

// ========== Template Message Detection & Parsing ==========

interface ParsedTemplateMessage {
  templateName: string
  header?: {
    type: 'text' | 'image' | 'video' | 'document' | 'location'
    content: string
  }
  body: string
  footer?: string
  buttons: Array<{
    type: 'url' | 'phone' | 'quick_reply' | 'copy_code' | 'flow' | 'other'
    text: string
  }>
}

/**
 * Detecta se uma mensagem é um template renderizado pelo renderTemplatePreviewText
 */
function isTemplateMessage(content: string): boolean {
  return content.startsWith('📋 *Template:')
}

/**
 * Parseia uma mensagem de template em componentes estruturados
 */
function parseTemplateMessage(content: string): ParsedTemplateMessage | null {
  if (!isTemplateMessage(content)) return null

  const lines = content.split('\n')

  // Linha 1: "📋 *Template: nome_do_template*"
  const headerLine = lines[0]
  const nameMatch = headerLine.match(/📋 \*Template: (.+)\*/)
  if (!nameMatch) return null

  const templateName = nameMatch[1]
  const result: ParsedTemplateMessage = {
    templateName,
    body: '',
    buttons: [],
  }

  // Parse restante do conteúdo
  let currentSection: 'header' | 'body' | 'footer' | 'buttons' = 'header'
  const bodyLines: string[] = []
  let i = 1

  // Pular linha vazia após header
  while (i < lines.length && lines[i].trim() === '') i++

  // Processar linhas
  while (i < lines.length) {
    const line = lines[i]

    // Detectar header de mídia
    if (line === '[🖼️ Imagem]') {
      result.header = { type: 'image', content: 'Imagem' }
      i++
      continue
    }
    if (line === '[🎬 Vídeo]') {
      result.header = { type: 'video', content: 'Vídeo' }
      i++
      continue
    }
    if (line === '[📄 Documento]') {
      result.header = { type: 'document', content: 'Documento' }
      i++
      continue
    }
    if (line.startsWith('[📍 ')) {
      const locContent = line.match(/\[📍 (.+)\]/)?.[1] || 'Localização'
      result.header = { type: 'location', content: locContent }
      i++
      continue
    }

    // Detectar header de texto (linha com * no início e fim, mas não é o nome do template)
    if (currentSection === 'header' && line.startsWith('*') && line.endsWith('*') && !line.includes('Template:')) {
      result.header = { type: 'text', content: line.slice(1, -1) }
      i++
      continue
    }

    // Detectar separador de botões
    if (line === '---') {
      currentSection = 'buttons'
      i++
      continue
    }

    // Detectar botões (após o ---)
    if (currentSection === 'buttons' && line.startsWith('[')) {
      const btnMatch = line.match(/\[([🔗📞💬📋📝]?)\s*(.+)\]/)
      if (btnMatch) {
        const emoji = btnMatch[1]
        const text = btnMatch[2]
        let type: ParsedTemplateMessage['buttons'][0]['type'] = 'other'

        if (emoji === '🔗') type = 'url'
        else if (emoji === '📞') type = 'phone'
        else if (emoji === '💬') type = 'quick_reply'
        else if (emoji === '📋') type = 'copy_code'
        else if (emoji === '📝') type = 'flow'

        result.buttons.push({ type, text })
      }
      i++
      continue
    }

    // Detectar footer (linha que começa e termina com _)
    if (line.startsWith('_') && line.endsWith('_') && line.length > 2) {
      result.footer = line.slice(1, -1)
      i++
      continue
    }

    // Todo o resto é body (incluindo linhas vazias para preservar espaçamento)
    if (currentSection !== 'buttons') {
      bodyLines.push(line)
    }

    i++
  }

  // Junta as linhas preservando quebras de linha e remove espaços no início/fim
  result.body = bodyLines.join('\n').trim()

  return result
}

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

// ========== Template Message Renderer ==========

/**
 * Renderiza mensagem de template com visual similar ao WhatsApp Web.
 *
 * Design:
 * - Barra verde lateral como indicador de template
 * - Header em negrito
 * - Body preserva whitespace e formatação WhatsApp
 * - Footer separado por linha, texto menor
 * - Botões como cards escuros com título e URL
 */
function TemplateMessageContent({ parsed, time, deliveryStatus }: {
  parsed: ParsedTemplateMessage
  time: string
  deliveryStatus?: DeliveryStatus
}) {
  return (
    <div className="flex w-full">
      {/* Barra lateral verde - indicador de template */}
      <div className="w-1 bg-emerald-500 rounded-full mr-3 flex-shrink-0" />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header (título do template em negrito) */}
        {parsed.header && parsed.header.type === 'text' && (
          <p className="text-base font-bold text-white mb-3">
            {parsed.header.content}
          </p>
        )}

        {/* Header de mídia */}
        {parsed.header && parsed.header.type !== 'text' && (
          <div className="flex items-center gap-2 text-zinc-300 text-sm mb-3 bg-zinc-800/50 rounded px-2 py-1.5">
            {parsed.header.type === 'image' && <span>🖼️</span>}
            {parsed.header.type === 'video' && <span>🎬</span>}
            {parsed.header.type === 'document' && <span>📄</span>}
            {parsed.header.type === 'location' && <span>📍</span>}
            <span>{parsed.header.content}</span>
          </div>
        )}

        {/* Body - preserva whitespace e formatação WhatsApp */}
        {parsed.body && (
          <div className="text-base text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
            <WhatsAppFormattedText text={parsed.body} />
          </div>
        )}

        {/* Footer - separado por linha visível, texto mais sutil */}
        {parsed.footer && (
          <div className="mt-5 pt-4 border-t border-zinc-600/60">
            <p className="text-sm text-zinc-500">
              {parsed.footer}
            </p>
          </div>
        )}

        {/* Botões - cards escuros minimalistas */}
        {parsed.buttons.length > 0 && (
          <div className="mt-4 space-y-2">
            {parsed.buttons.map((btn, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-zinc-800/90 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-300">{btn.text}</span>
                </div>
                {(btn.type === 'url' || btn.type === 'flow') && (
                  <svg
                    className="h-4 w-4 text-blue-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Template name, Time & Status */}
        <div className="flex items-center justify-end gap-1.5 mt-3">
          <span className="text-[10px] text-zinc-500">📋 {parsed.templateName}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">{time}</span>
          {deliveryStatus && <DeliveryStatusIcon status={deliveryStatus} />}
        </div>
      </div>
    </div>
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

  // Check if this is a template message
  const parsedTemplate = useMemo(() => {
    if (isInbound) return null // Templates são sempre outbound
    return parseTemplateMessage(content)
  }, [content, isInbound])

  const isTemplate = parsedTemplate !== null

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
            // Template message: fundo verde escuro especial
            isTemplate && 'bg-zinc-900/95 text-white',
            // Outbound humano (não template): verde desaturado, elegante
            !isInbound && !isAIResponse && !isTemplate && 'bg-emerald-600/80 text-white',
            // AI Response (não template): verde mais escuro para diferenciar
            isAIResponse && !isTemplate && 'bg-emerald-700/70 text-emerald-50'
          )}
        >
          {/* Template message - special rendering */}
          {isTemplate && parsedTemplate ? (
            <TemplateMessageContent
              parsed={parsedTemplate}
              time={time}
              deliveryStatus={delivery_status}
            />
          ) : (
            <>
              {/* Regular message content with WhatsApp formatting */}
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
            </>
          )}
        </div>

        {/* Footer - only on last message of group, and not for templates (they have their own footer) */}
        {isLastInGroup && !isTemplate && (
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
