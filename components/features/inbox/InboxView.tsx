'use client'

/**
 * InboxView - Seamless Split Layout
 *
 * Design Philosophy:
 * - No visible borders between panels (seamless feel)
 * - Subtle shadows for depth instead of hard lines
 * - Unified dark background with micro-variations
 * - Invisible resize handle (functional, not visual)
 */

import React, { useCallback } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ConversationList } from './ConversationList'
import { MessagePanel } from './MessagePanel'
import { RefreshCw, MessageSquare, Users } from 'lucide-react'
import type {
  InboxConversation,
  InboxMessage,
  InboxLabel,
  InboxQuickReply,
  ConversationStatus,
  ConversationMode,
  ConversationPriority,
} from '@/types'

export interface InboxViewProps {
  // Conversations
  conversations: InboxConversation[]
  isLoadingConversations: boolean
  totalUnread: number

  // Selected conversation
  selectedConversationId: string | null
  onSelectConversation: (id: string | null) => void
  selectedConversation: InboxConversation | null
  isLoadingSelectedConversation: boolean

  // Messages
  messages: InboxMessage[]
  isLoadingMessages: boolean
  isLoadingMoreMessages: boolean
  hasMoreMessages: boolean
  onLoadMoreMessages: () => void

  // Message sending
  onSendMessage: (content: string) => void
  isSending: boolean

  // Labels
  labels: InboxLabel[]

  // Quick Replies
  quickReplies: InboxQuickReply[]
  quickRepliesLoading: boolean
  onRefreshQuickReplies?: () => void

  // Filters
  search: string
  onSearchChange: (search: string) => void
  statusFilter: ConversationStatus | null
  onStatusFilterChange: (status: ConversationStatus | null) => void
  modeFilter: ConversationMode | null
  onModeFilterChange: (mode: ConversationMode | null) => void
  labelFilter: string | null
  onLabelFilterChange: (labelId: string | null) => void

  // Conversation actions
  onModeToggle: () => void
  onCloseConversation: () => void
  onReopenConversation: () => void
  onPriorityChange: (priority: ConversationPriority) => void
  onLabelToggle: (labelId: string) => void
  /** T050: Handoff to human */
  onHandoff?: (params?: { reason?: string; summary?: string; pauseMinutes?: number }) => void
  /** T050: Return to bot */
  onReturnToBot?: () => void
  /** Delete conversation */
  onDeleteConversation?: () => void
  /** Configure AI agent */
  onConfigureAgent?: () => void
  isUpdatingConversation: boolean
  isHandingOff?: boolean
  isReturningToBot?: boolean
  isDeletingConversation?: boolean
}

export function InboxView({
  conversations,
  isLoadingConversations,
  totalUnread,
  selectedConversationId,
  onSelectConversation,
  selectedConversation,
  isLoadingSelectedConversation,
  messages,
  isLoadingMessages,
  isLoadingMoreMessages,
  hasMoreMessages,
  onLoadMoreMessages,
  onSendMessage,
  isSending,
  labels,
  quickReplies,
  quickRepliesLoading,
  onRefreshQuickReplies,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  modeFilter,
  onModeFilterChange,
  labelFilter,
  onLabelFilterChange,
  onModeToggle,
  onCloseConversation,
  onReopenConversation,
  onPriorityChange,
  onLabelToggle,
  onHandoff,
  onReturnToBot,
  onDeleteConversation,
  onConfigureAgent,
  isUpdatingConversation,
  isHandingOff,
  isReturningToBot,
  isDeletingConversation,
}: InboxViewProps) {
  // Handle conversation selection
  const handleSelectConversation = useCallback(
    (id: string) => {
      onSelectConversation(id)
    },
    [onSelectConversation]
  )

  // Panel-specific error fallbacks - matching seamless background
  const ConversationListFallback = (
    <div className="h-full flex flex-col items-center justify-center p-4 text-center bg-[var(--ds-bg-elevated)]">
      <div className="w-10 h-10 mb-3 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center">
        <Users className="w-5 h-5 text-[var(--ds-text-muted)]" />
      </div>
      <p className="text-sm text-[var(--ds-text-secondary)] mb-3">Erro ao carregar</p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Recarregar
      </button>
    </div>
  )

  const MessagePanelFallback = (
    <div className="h-full flex flex-col items-center justify-center p-4 text-center bg-[var(--ds-bg-base)]">
      <div className="w-10 h-10 mb-3 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center">
        <MessageSquare className="w-5 h-5 text-[var(--ds-text-muted)]" />
      </div>
      <p className="text-sm text-[var(--ds-text-secondary)] mb-3">Erro ao carregar</p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] rounded-lg hover:bg-[var(--ds-bg-hover)] transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Recarregar
      </button>
    </div>
  )

  return (
    <TooltipProvider delayDuration={300}>
      {/* Full height container - uses parent height from PageLayoutScope */}
      <div className="h-full bg-[var(--ds-bg-base)]">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          {/* Conversation list sidebar - subtle shadow instead of border */}
          <ResizablePanel
            defaultSize="28%"
            minSize="22%"
            maxSize="38%"
            className="relative"
          >
            {/* Sidebar with subtle right shadow for depth */}
            <div className="h-full shadow-[1px_0_8px_-2px_rgba(0,0,0,0.3)]">
              <ErrorBoundary fallback={ConversationListFallback}>
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                  isLoading={isLoadingConversations}
                  totalUnread={totalUnread}
                  labels={labels}
                  search={search}
                  onSearchChange={onSearchChange}
                  statusFilter={statusFilter}
                  onStatusFilterChange={onStatusFilterChange}
                  modeFilter={modeFilter}
                  onModeFilterChange={onModeFilterChange}
                  labelFilter={labelFilter}
                  onLabelFilterChange={onLabelFilterChange}
                />
              </ErrorBoundary>
            </div>
          </ResizablePanel>

          {/* Invisible resize handle - functional but not visual */}
          <ResizableHandle className="w-px bg-transparent hover:bg-[var(--ds-border-strong)] transition-colors" />

          {/* Message panel - main content area */}
          <ResizablePanel defaultSize="72%" minSize="50%">
            <ErrorBoundary fallback={MessagePanelFallback}>
              <MessagePanel
                conversation={selectedConversation}
                messages={messages}
                labels={labels}
                quickReplies={quickReplies}
                isLoadingConversation={isLoadingSelectedConversation}
                isLoadingMessages={isLoadingMessages}
                isLoadingMore={isLoadingMoreMessages}
                isSending={isSending}
                quickRepliesLoading={quickRepliesLoading}
                onRefreshQuickReplies={onRefreshQuickReplies}
                hasMoreMessages={hasMoreMessages}
                onLoadMore={onLoadMoreMessages}
                onSendMessage={onSendMessage}
                onModeToggle={onModeToggle}
                onClose={onCloseConversation}
                onReopen={onReopenConversation}
                onPriorityChange={onPriorityChange}
                onLabelToggle={onLabelToggle}
                onHandoff={onHandoff}
                onReturnToBot={onReturnToBot}
                onDelete={onDeleteConversation}
                onConfigureAgent={onConfigureAgent}
                isUpdating={isUpdatingConversation}
                isHandingOff={isHandingOff}
                isReturningToBot={isReturningToBot}
                isDeleting={isDeletingConversation}
              />
            </ErrorBoundary>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  )
}
