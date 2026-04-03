'use client';

import React from 'react';
import { Search, Filter } from 'lucide-react';
import { ContactStatus, StatusOption } from './types';

export interface ContactFiltersProps {
  // Search
  searchTerm: string;
  onSearchChange: (term: string) => void;

  // Status filter
  statusFilter: ContactStatus | 'ALL' | 'SUPPRESSED';
  onStatusFilterChange: (status: ContactStatus | 'ALL' | 'SUPPRESSED') => void;

  // Tag filter
  tagFilter: string;
  onTagFilterChange: (tag: string) => void;
  tags: string[];

  // Filter visibility
  showFilters: boolean;
  onToggleFilters: () => void;
}

const statusOptions: StatusOption[] = [
  { value: 'ALL', label: 'Todos Status' },
  { value: ContactStatus.OPT_IN, label: 'Opt-in' },
  { value: ContactStatus.OPT_OUT, label: 'Opt-out' },
  { value: ContactStatus.UNKNOWN, label: 'Desconhecido' },
  { value: 'SUPPRESSED', label: 'Suprimidos' }
];

export const ContactFilters: React.FC<ContactFiltersProps> = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  tagFilter,
  onTagFilterChange,
  tags,
  showFilters,
  onToggleFilters
}) => {
  return (
    <div className="p-5 border-b border-[var(--ds-border-subtle)] flex flex-col lg:flex-row gap-4">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl px-4 py-2.5 max-w-md focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/50 transition-all">
        <Search size={18} className="text-[var(--ds-text-muted)]" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por nome ou telefone..."
          className="bg-transparent border-none outline-none text-sm w-full text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)]"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar contatos por nome ou telefone"
        />
      </div>

      {/* Filter Toggles */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleFilters}
          className={`p-2.5 rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2 ${showFilters || statusFilter !== 'ALL' || tagFilter !== 'ALL'
            ? 'text-primary-400 bg-primary-500/10 border-primary-500/30'
            : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] border-[var(--ds-border-default)]'
            }`}
          aria-label={showFilters ? "Ocultar filtros avançados" : "Mostrar filtros avançados"}
          aria-expanded={showFilters}
        >
          <Filter size={20} aria-hidden="true" />
        </button>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as ContactStatus | 'ALL' | 'SUPPRESSED')}
          className="px-4 py-2.5 text-sm font-medium bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:text-[var(--ds-text-primary)] rounded-xl border border-[var(--ds-border-default)] transition-colors outline-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
          aria-label="Filtrar contatos por status"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Tag Filter */}
        <select
          value={tagFilter}
          onChange={(e) => onTagFilterChange(e.target.value)}
          className="px-4 py-2.5 text-sm font-medium bg-[var(--ds-bg-elevated)] text-[var(--ds-text-primary)] hover:text-[var(--ds-text-primary)] rounded-xl border border-[var(--ds-border-default)] transition-colors outline-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2"
          aria-label="Filtrar contatos por tag"
        >
          <option value="ALL">Todas Tags</option>
          <option value="NONE">Sem tags</option>
          {tags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export interface ContactResultsInfoProps {
  displayedCount: number;
  totalFiltered: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export const ContactResultsInfo: React.FC<ContactResultsInfoProps> = ({
  displayedCount,
  totalFiltered,
  hasActiveFilters,
  onClearFilters
}) => {
  return (
    <div className="px-5 py-3 bg-[var(--ds-bg-hover)] border-b border-[var(--ds-border-subtle)] flex items-center justify-between text-sm">
      <span className="text-[var(--ds-text-muted)]" aria-live="polite">
        Mostrando <span className="text-[var(--ds-text-primary)] font-medium">{displayedCount}</span> de{' '}
        <span className="text-[var(--ds-text-primary)] font-medium">{totalFiltered}</span> contatos
      </span>
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="text-primary-400 hover:text-primary-300 text-xs font-medium"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
};

export interface ContactSelectionBannerProps {
  selectedCount: number;
  pageCount: number;
  totalFiltered: number;
  onSelectAllGlobal: () => void;
  onClearSelection: () => void;
}

export const ContactSelectionBanner: React.FC<ContactSelectionBannerProps> = ({
  selectedCount,
  pageCount,
  totalFiltered,
  onSelectAllGlobal,
  onClearSelection
}) => {
  // Show "select all" option when page is fully selected but not all filtered
  if (selectedCount === pageCount && selectedCount < totalFiltered) {
    return (
      <div className="bg-primary-500/10 border-b border-primary-500/20 px-6 py-2 text-center text-sm">
        <span className="text-[var(--ds-text-primary)]">
          Todos os <strong>{pageCount}</strong> contatos desta página foram selecionados.
        </span>
        <button
          onClick={onSelectAllGlobal}
          className="ml-2 font-bold text-primary-400 hover:text-primary-300 hover:underline transition-colors animate-pulse"
        >
          Selecionar todos os {totalFiltered} contatos
        </button>
      </div>
    );
  }

  // Show "all selected" message when all filtered contacts are selected
  if (selectedCount === totalFiltered && totalFiltered > pageCount) {
    return (
      <div className="bg-primary-500/10 border-b border-primary-500/20 px-6 py-2 text-center text-sm">
        <span className="text-primary-400 font-medium">
          Todos os <strong>{totalFiltered}</strong> contatos foram selecionados.
        </span>
        <button
          onClick={onClearSelection}
          className="ml-2 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:underline transition-colors"
        >
          Limpar seleção
        </button>
      </div>
    );
  }

  return null;
};
