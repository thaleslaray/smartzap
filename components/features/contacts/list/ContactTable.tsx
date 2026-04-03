'use client';

import React from 'react';
import { Edit2, Trash2, Tag, ChevronLeft, ChevronRight, ShieldOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Contact, ContactStatus } from './types';
import { calculateRelativeTime, getContactInitials } from './utils';
import { ContactCardList } from './ContactCard';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter';

export interface ContactTableProps {
  contacts: Contact[];
  isLoading: boolean;
  showSuppressionDetails: boolean;
  selectedIds: Set<string>;
  isAllSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onEditContact: (contact: Contact) => void;
  onDeleteClick: (id: string) => void;
  onUnsuppress?: (phone: string) => void;
}

export const ContactTable: React.FC<ContactTableProps> = ({
  contacts,
  isLoading,
  showSuppressionDetails,
  selectedIds,
  isAllSelected,
  onToggleSelect,
  onToggleSelectAll,
  onEditContact,
  onDeleteClick,
  onUnsuppress
}) => {
  const isMobile = useIsMobile();
  const tableColSpan = showSuppressionDetails ? 8 : 7;

  // Mobile: render cards instead of table
  if (isMobile) {
    return (
      <ContactCardList
        contacts={contacts}
        isLoading={isLoading}
        showSuppressionDetails={showSuppressionDetails}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onEditContact={onEditContact}
        onDeleteClick={onDeleteClick}
        onUnsuppress={onUnsuppress}
      />
    );
  }

  // Desktop: render table
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-left text-sm" aria-label="Lista de contatos">
        <thead className="bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] uppercase text-xs tracking-wider">
          <tr>
            <th scope="col" className="w-8 px-6 py-4">
              <label className="sr-only" htmlFor="select-all">Selecionar todos os contatos</label>
              <input
                id="select-all"
                type="checkbox"
                className="rounded border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] checked:bg-primary-500"
                checked={isAllSelected}
                onChange={onToggleSelectAll}
                aria-label="Selecionar todos os contatos"
              />
            </th>
            <th scope="col" className="px-6 py-4 font-medium">Contato</th>
            <th scope="col" className="px-6 py-4 font-medium">Tags</th>
            <th scope="col" className="px-6 py-4 font-medium">Status</th>
            {showSuppressionDetails && (
              <th scope="col" className="px-6 py-4 font-medium">Motivo</th>
            )}
            <th scope="col" className="px-6 py-4 font-medium">Data Criação</th>
            <th scope="col" className="px-6 py-4 font-medium">Última Atividade</th>
            <th scope="col" className="px-6 py-4 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-border-subtle)]">
          {isLoading ? (
            <tr>
              <td colSpan={tableColSpan} className="px-6 py-8 text-center text-[var(--ds-text-muted)]">
                Carregando contatos...
              </td>
            </tr>
          ) : contacts.length === 0 ? (
            <tr>
              <td colSpan={tableColSpan} className="px-6 py-8 text-center text-[var(--ds-text-muted)]">
                Nenhum contato encontrado.
              </td>
            </tr>
          ) : (
            contacts.map((contact) => (
              <ContactTableRow
                key={contact.id}
                contact={contact}
                isSelected={selectedIds.has(contact.id)}
                showSuppressionDetails={showSuppressionDetails}
                onToggleSelect={onToggleSelect}
                onEdit={onEditContact}
                onDelete={onDeleteClick}
                onUnsuppress={onUnsuppress}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

interface ContactTableRowProps {
  contact: Contact;
  isSelected: boolean;
  showSuppressionDetails: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onUnsuppress?: (phone: string) => void;
}

// Memoized row component - prevents re-render when other rows change
const ContactTableRow = React.memo(
  function ContactTableRow({
    contact,
    isSelected,
    showSuppressionDetails,
    onToggleSelect,
    onEdit,
    onDelete,
    onUnsuppress
  }: ContactTableRowProps) {
    const displayName = contact.name || contact.phone;

    return (
      <tr className="hover:bg-[var(--ds-bg-hover)] transition-all duration-200 group hover:shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]">
        <td className="px-6 py-5">
          <input
            type="checkbox"
            className="rounded border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] checked:bg-primary-500"
            checked={isSelected}
            onChange={() => onToggleSelect(contact.id)}
            aria-label={`Selecionar ${displayName}`}
          />
        </td>
        <td className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full bg-linear-to-br from-[var(--ds-bg-surface)] to-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] text-[var(--ds-text-primary)] flex items-center justify-center font-bold text-xs shadow-inner"
              aria-hidden="true"
            >
              {getContactInitials(displayName)}
            </div>
            <div>
              <p className="font-medium text-[var(--ds-text-primary)] group-hover:text-primary-400 transition-colors">
                {displayName}
              </p>
              <p className="text-xs text-[var(--ds-text-muted)] font-mono">{formatPhoneNumberDisplay(contact.phone, 'e164')}</p>
            </div>
          </div>
        </td>
        <td className="px-6 py-5">
          <div className="flex gap-1.5 flex-wrap">
            {contact.tags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] border border-[var(--ds-border-subtle)]"
              >
                <Tag size={10} className="mr-1.5 opacity-50" aria-hidden="true" /> {tag}
              </span>
            ))}
          </div>
        </td>
        <td className="px-6 py-5">
          <div className="flex items-center gap-2">
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
            {/* Botão de desuprimir aparece quando status é SUPPRESSED */}
            {contact.status === ContactStatus.SUPPRESSED && onUnsuppress && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => onUnsuppress(contact.phone)}
                    aria-label="Remover supressão"
                  >
                    <ShieldOff size={14} aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Remover supressão</p></TooltipContent>
              </Tooltip>
            )}
          </div>
        </td>
        {showSuppressionDetails && (
          <td className="px-6 py-5 text-xs text-[var(--ds-text-secondary)]">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--ds-text-primary)]">{contact.suppressionReason || '—'}</div>
                <div className="text-[10px] text-[var(--ds-text-muted)]">
                  {contact.suppressionSource ? `Fonte: ${contact.suppressionSource}` : 'Fonte: —'}
                </div>
              </div>
            </div>
          </td>
        )}
        <td className="px-6 py-5 text-[var(--ds-text-muted)] text-xs">
          {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString('pt-BR') : '-'}
        </td>
        <td className="px-6 py-5 text-[var(--ds-text-muted)] text-xs">
          {contact.updatedAt
            ? calculateRelativeTime(contact.updatedAt)
            : (contact.createdAt ? calculateRelativeTime(contact.createdAt) : '-')}
        </td>
        <td className="px-6 py-5 text-right">
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(contact)}
                  aria-label={`Editar contato ${displayName}`}
                >
                  <Edit2 size={16} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Editar contato</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost-destructive"
                  size="icon"
                  onClick={() => onDelete(contact.id)}
                  aria-label={`Excluir contato ${displayName}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Excluir contato</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </td>
      </tr>
    );
  },
  // Custom comparison: re-render only when relevant props change
  (prev, next) => (
    prev.contact.id === next.contact.id &&
    prev.contact.updatedAt === next.contact.updatedAt &&
    prev.contact.status === next.contact.status &&
    prev.isSelected === next.isSelected &&
    prev.showSuppressionDetails === next.showSuppressionDetails
  )
);

export interface ContactPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const ContactPagination: React.FC<ContactPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange
}) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
      if (totalPages <= 5) {
        return i + 1;
      } else if (currentPage <= 3) {
        return i + 1;
      } else if (currentPage >= totalPages - 2) {
        return totalPages - 4 + i;
      } else {
        return currentPage - 2 + i;
      }
    });
  };

  return (
    <div className="px-6 py-4 border-t border-[var(--ds-border-subtle)] flex items-center justify-between">
      <span className="text-sm text-[var(--ds-text-muted)]">
        Página {currentPage} de {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Página anterior"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Página anterior</p>
          </TooltipContent>
        </Tooltip>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((pageNum) => (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum}
            </Button>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Próxima página"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Próxima página</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
