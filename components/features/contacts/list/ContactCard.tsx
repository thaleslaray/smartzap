'use client'

import React from 'react'
import { Edit2, Trash2, Tag, Check, User, ShieldOff } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Contact, ContactStatus } from './types'
import { calculateRelativeTime, getContactInitials } from './utils'
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter'

// =============================================================================
// CONTACT CARD
// =============================================================================

interface ContactCardProps {
  contact: Contact
  isSelected: boolean
  showSuppressionDetails: boolean
  onToggleSelect: (id: string) => void
  onEdit: (contact: Contact) => void
  onDelete: (id: string) => void
  onUnsuppress?: (phone: string) => void
}

export const ContactCard = React.memo(
  function ContactCard({
    contact,
    isSelected,
    showSuppressionDetails,
    onToggleSelect,
    onEdit,
    onDelete,
    onUnsuppress
  }: ContactCardProps) {
    const displayName = contact.name || contact.phone

    return (
      <div
        className={`p-4 border rounded-xl transition-colors ${
          isSelected
            ? 'border-primary-500/40 bg-primary-500/5'
            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:bg-[var(--ds-bg-hover)]'
        }`}
      >
        {/* Header: Checkbox, Avatar, Name, Status */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(contact.id)
            }}
            className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-primary-500 border-primary-500'
                : 'border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)]'
            }`}
            aria-label={isSelected ? 'Desmarcar' : 'Selecionar'}
          >
            {isSelected && <Check className="w-3 h-3 text-[var(--ds-text-primary)]" />}
          </button>

          {/* Avatar */}
          <div
            className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[var(--ds-bg-surface)] to-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] flex items-center justify-center font-bold text-xs"
            aria-hidden="true"
          >
            {getContactInitials(displayName)}
          </div>

          {/* Name + Phone */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--ds-text-primary)] truncate">{displayName}</p>
            <p className="text-xs text-[var(--ds-text-muted)] font-mono">{formatPhoneNumberDisplay(contact.phone, 'e164')}</p>
          </div>

          {/* Status */}
          <div className="shrink-0 flex items-center gap-1">
            <StatusBadge
              status={
                contact.status === ContactStatus.SUPPRESSED ? 'error' :
                contact.status === ContactStatus.OPT_IN ? 'success' :
                contact.status === ContactStatus.OPT_OUT ? 'error' : 'default'
              }
              size="sm"
            >
              {contact.status === ContactStatus.SUPPRESSED ? 'SUPRIMIDO' :
               contact.status === ContactStatus.OPT_IN ? 'OPT_IN' :
               contact.status === ContactStatus.OPT_OUT ? 'OPT_OUT' : 'DESCONHECIDO'}
            </StatusBadge>
            {/* Botão de desuprimir */}
            {contact.status === ContactStatus.SUPPRESSED && onUnsuppress && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    onClick={(e) => {
                      e.stopPropagation()
                      onUnsuppress(contact.phone)
                    }}
                    aria-label="Remover supressão"
                  >
                    <ShieldOff size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Remover supressão</p></TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            {contact.tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] border border-[var(--ds-border-subtle)]"
              >
                <Tag size={10} className="mr-1 opacity-50" /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Suppression details (optional) */}
        {showSuppressionDetails && contact.suppressionReason && (
          <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-300">{contact.suppressionReason}</p>
            {contact.suppressionSource && (
              <p className="text-[10px] text-red-400/60 mt-0.5">
                Fonte: {contact.suppressionSource}
              </p>
            )}
          </div>
        )}

        {/* Footer: Dates + Actions */}
        <div className="mt-3 pt-3 border-t border-[var(--ds-border-subtle)] flex items-center justify-between">
          <div className="text-xs text-[var(--ds-text-muted)]">
            <span>
              Criado: {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString('pt-BR') : '-'}
            </span>
            <span className="mx-2">•</span>
            <span>
              {contact.updatedAt
                ? calculateRelativeTime(contact.updatedAt)
                : contact.createdAt
                  ? calculateRelativeTime(contact.createdAt)
                  : '-'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(contact)
                  }}
                  aria-label="Editar contato"
                >
                  <Edit2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Editar</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(contact.id)
                  }}
                  aria-label="Excluir contato"
                >
                  <Trash2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Excluir</p></TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    )
  },
  // Custom comparison
  (prev, next) => (
    prev.contact.id === next.contact.id &&
    prev.contact.updatedAt === next.contact.updatedAt &&
    prev.contact.status === next.contact.status &&
    prev.isSelected === next.isSelected &&
    prev.showSuppressionDetails === next.showSuppressionDetails
  )
)

// =============================================================================
// CONTACT CARD LIST
// =============================================================================

interface ContactCardListProps {
  contacts: Contact[]
  isLoading: boolean
  showSuppressionDetails: boolean
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onEditContact: (contact: Contact) => void
  onDeleteClick: (id: string) => void
  onUnsuppress?: (phone: string) => void
}

export const ContactCardList: React.FC<ContactCardListProps> = ({
  contacts,
  isLoading,
  showSuppressionDetails,
  selectedIds,
  onToggleSelect,
  onEditContact,
  onDeleteClick,
  onUnsuppress
}) => {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-[var(--ds-text-muted)]">
        Carregando contatos...
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center mx-auto mb-3">
          <User size={24} className="text-[var(--ds-text-muted)]" />
        </div>
        <p className="text-[var(--ds-text-secondary)] font-medium">Nenhum contato encontrado</p>
        <p className="text-[var(--ds-text-muted)] text-sm mt-1">
          Tente ajustar os filtros ou importe novos contatos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          isSelected={selectedIds.has(contact.id)}
          showSuppressionDetails={showSuppressionDetails}
          onToggleSelect={onToggleSelect}
          onEdit={onEditContact}
          onDelete={onDeleteClick}
          onUnsuppress={onUnsuppress}
        />
      ))}
    </div>
  )
}
