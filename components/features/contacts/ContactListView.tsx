'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Trash2, UploadCloud, Download, FileText, Plus, Tag, CircleUser } from 'lucide-react';
import { Contact, ContactStatus, CustomFieldDefinition } from '../../../types';
import { CustomFieldsSheet } from './CustomFieldsSheet';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';

// Import extracted components
import {
  ContactStats as ContactStatsComponent,
  ContactFilters,
  ContactResultsInfo,
  ContactSelectionBanner,
  ContactTable,
  ContactPagination,
  ContactAddModal,
  ContactEditModal,
  ContactDeleteModal,
} from './list';
import { ContactBulkTagsModal } from './list/ContactBulkTagsModal';
import { ContactBulkStatusModal } from './list/ContactBulkStatusModal';

// Lazy-load ContactImportModal (raramente usado, pesado)
const ContactImportModal = dynamic(
  () => import('./list').then((m) => ({ default: m.ContactImportModal })),
  { loading: () => null }
);

// Import types
import type {
  ContactStatsData,
  ImportContact,
  NewContactForm,
  EditContactForm,
  DeleteTarget
} from './list';

export interface ContactListViewProps {
  // Data
  contacts: Contact[];
  stats: ContactStatsData;
  tags: string[];
  customFields?: CustomFieldDefinition[];
  onRefreshCustomFields?: () => void;
  isLoading: boolean;

  // Search & Filters
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: ContactStatus | 'ALL' | 'SUPPRESSED';
  onStatusFilterChange: (status: ContactStatus | 'ALL' | 'SUPPRESSED') => void;
  tagFilter: string;
  onTagFilterChange: (tag: string) => void;

  // Pagination
  currentPage: number;
  totalPages: number;
  totalFiltered: number;
  onPageChange: (page: number) => void;

  // Selection
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  selectAllGlobal: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;

  // Modals
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  isDeleteModalOpen: boolean;
  editingContact: Contact | null;
  deleteTarget: DeleteTarget | null;

  // Actions
  onAddContact: (contact: NewContactForm) => void;
  onEditContact: (contact: Contact) => void;
  onUpdateContact: (data: EditContactForm) => void;
  onDeleteClick: (id: string) => void;
  onBulkDeleteClick: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onImport: (contacts: ImportContact[]) => Promise<{ inserted: number; updated: number }>;
  isImporting: boolean;
  isDeleting: boolean;
  onUnsuppress?: (phone: string) => void;
  onBulkUpdateTags: (tagsToAdd: string[], tagsToRemove: string[], onDone?: () => void) => void;
  isBulkUpdatingTags?: boolean;
  onBulkUpdateStatus: (status: ContactStatus) => void;
  isBulkUpdatingStatus?: boolean;
}

export const ContactListView: React.FC<ContactListViewProps> = ({
  contacts,
  stats,
  tags,
  isLoading,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  tagFilter,
  onTagFilterChange,
  currentPage,
  totalPages,
  totalFiltered,
  onPageChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  selectAllGlobal,
  clearSelection,
  isAllSelected,
  isSomeSelected,
  isAddModalOpen,
  setIsAddModalOpen,
  isImportModalOpen,
  setIsImportModalOpen,
  isEditModalOpen,
  setIsEditModalOpen,
  isDeleteModalOpen,
  editingContact,
  deleteTarget,
  onAddContact,
  onEditContact,
  onUpdateContact,
  onDeleteClick,
  onBulkDeleteClick,
  onConfirmDelete,
  onCancelDelete,
  onImport,
  isImporting,
  isDeleting,
  customFields,
  onRefreshCustomFields,
  onUnsuppress,
  onBulkUpdateTags,
  isBulkUpdatingTags,
  onBulkUpdateStatus,
  isBulkUpdatingStatus,
}) => {
  // Local state
  const [showFilters, setShowFilters] = useState(false);
  const [localCustomFields, setLocalCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [isBulkTagsModalOpen, setIsBulkTagsModalOpen] = useState(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState(false);

  // Initialize local custom fields from props
  useEffect(() => {
    if (customFields) {
      setLocalCustomFields(customFields);
    }
  }, [customFields]);

  // Custom field handlers - memoized to prevent child re-renders
  const handleCustomFieldCreated = useCallback((field: CustomFieldDefinition) => {
    setLocalCustomFields((prev) => {
      if (prev.some((f) => f.id === field.id || f.key === field.key)) return prev;
      return [...prev, field];
    });
    onRefreshCustomFields?.();
  }, [onRefreshCustomFields]);

  const handleCustomFieldDeleted = useCallback((id: string) => {
    setLocalCustomFields((prev) => prev.filter((f) => f.id !== id));
    onRefreshCustomFields?.();
  }, [onRefreshCustomFields]);

  // Computed values
  const showSuppressionDetails = statusFilter === 'SUPPRESSED';
  const hasActiveFilters = statusFilter !== 'ALL' || tagFilter !== 'ALL' || !!searchTerm;

  const handleClearFilters = useCallback(() => {
    onSearchChange('');
    onStatusFilterChange('ALL');
    onTagFilterChange('ALL');
  }, [onSearchChange, onStatusFilterChange, onTagFilterChange]);

  // Memoized toggle handler to prevent ContactFilters re-render
  const handleToggleFilters = useCallback(() => setShowFilters((prev) => !prev), []);

  // Memoized modal close handlers to prevent child re-renders
  const handleCloseAddModal = useCallback(() => setIsAddModalOpen(false), [setIsAddModalOpen]);
  const handleCloseEditModal = useCallback(() => setIsEditModalOpen(false), [setIsEditModalOpen]);
  const handleCloseImportModal = useCallback(() => setIsImportModalOpen(false), [setIsImportModalOpen]);

  // Export state and handler
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsExporting(true);
    try {
      let exportContacts: Contact[];

      // Se há mais selecionados do que na página atual, buscar todos da API
      const currentPageSelectedCount = contacts.filter((c) => selectedIds.has(c.id)).length;

      if (selectedIds.size > currentPageSelectedCount) {
        // Buscar todos os contatos e filtrar pelos selecionados
        const { contactService } = await import('@/services/contactService');
        const allContacts = await contactService.getAll();
        exportContacts = allContacts.filter((c) => selectedIds.has(c.id));
      } else {
        // Usar apenas os da página atual
        exportContacts = contacts.filter((c) => selectedIds.has(c.id));
      }

      if (exportContacts.length === 0) {
        return;
      }

      // Build CSV
      const headers = ['Nome', 'Telefone', 'Email', 'Status', 'Tags', 'Data Criação'];
      const rows = exportContacts.map((c) => [
        c.name || '',
        c.phone || '',
        c.email || '',
        c.status || '',
        Array.isArray(c.tags) ? c.tags.join(';') : '',
        c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      // Download
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contatos_${exportContacts.length}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [contacts, selectedIds]);

  return (
    <Page className="flex flex-col h-full min-h-0">
      {/* Page Header with Actions */}
      <PageHeader>
        <div>
          <PageTitle>Contatos</PageTitle>
          <PageDescription>Gerencie sua audiência e listas</PageDescription>
        </div>

        <PageActions className="flex-wrap justify-start sm:justify-end">
          {/* Ações de seleção + Import agrupados */}
          <div className="flex items-center gap-2">
            {isSomeSelected && (
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={isExporting}
                aria-label={`Exportar ${selectedIds.size} contato(s) selecionado(s)`}
                title="Exportar selecionados"
              >
                <Download size={18} aria-hidden="true" />
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              aria-label="Importar contatos via arquivo CSV"
              title="Importar CSV"
            >
              <UploadCloud size={18} aria-hidden="true" />
            </Button>
          </div>

          {/* Ações em lote separadas visualmente */}
          {isSomeSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkTagsModalOpen(true)}
              disabled={isBulkUpdatingTags}
              className="gap-2"
            >
              <Tag size={14} />
              Editar tags
              <span className="text-xs opacity-60">({selectedIds.size})</span>
            </Button>
          )}

          {isSomeSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkStatusModalOpen(true)}
              disabled={isBulkUpdatingStatus}
              className="gap-2"
            >
              <CircleUser size={14} />
              Editar status
              <span className="text-xs opacity-60">({selectedIds.size})</span>
            </Button>
          )}

          {isSomeSelected && (
            <Button
              variant="destructive"
              onClick={onBulkDeleteClick}
              aria-label={`Excluir ${selectedIds.size} contato(s) selecionado(s)`}
              title="Excluir selecionados"
            >
              <Trash2 size={18} aria-hidden="true" />
            </Button>
          )}

          <CustomFieldsSheet
            entityType="contact"
            onFieldCreated={handleCustomFieldCreated}
            onFieldDeleted={handleCustomFieldDeleted}
          >
            <Button
              variant="outline"
              type="button"
              aria-label="Gerenciar campos personalizados"
            >
              <FileText size={18} aria-hidden="true" />
              Campos personalizados
            </Button>
          </CustomFieldsSheet>

          <Button
            variant="brand"
            onClick={() => setIsAddModalOpen(true)}
            aria-label="Adicionar novo contato"
          >
            <Plus size={18} aria-hidden="true" />
            Novo Contato
          </Button>
        </PageActions>
      </PageHeader>

      {/* Stats Row */}
      <ContactStatsComponent stats={stats} />

      {/* Main Content Panel */}
      <Container variant="glass" padding="none" className="rounded-2xl flex-1 min-h-0 flex flex-col">
        {/* Filters */}
        <ContactFilters
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          tagFilter={tagFilter}
          onTagFilterChange={onTagFilterChange}
          tags={tags}
          showFilters={showFilters}
          onToggleFilters={handleToggleFilters}
        />

        {/* Results Info */}
        <ContactResultsInfo
          displayedCount={contacts.length}
          totalFiltered={totalFiltered}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearFilters}
        />

        {/* Selection Banner */}
        {contacts.length > 0 && (
          <ContactSelectionBanner
            selectedCount={selectedIds.size}
            pageCount={contacts.length}
            totalFiltered={totalFiltered}
            onSelectAllGlobal={selectAllGlobal}
            onClearSelection={clearSelection}
          />
        )}

        {/* Table */}
        <ContactTable
          contacts={contacts}
          isLoading={isLoading}
          showSuppressionDetails={showSuppressionDetails}
          selectedIds={selectedIds}
          isAllSelected={isAllSelected}
          onToggleSelect={onToggleSelect}
          onToggleSelectAll={onToggleSelectAll}
          onEditContact={onEditContact}
          onDeleteClick={onDeleteClick}
          onUnsuppress={onUnsuppress}
        />

        {/* Pagination */}
        <ContactPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </Container>

      {/* Modals */}
      <ContactAddModal
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        onSubmit={onAddContact}
        customFields={localCustomFields}
      />

      <ContactEditModal
        isOpen={isEditModalOpen}
        contact={editingContact}
        onClose={handleCloseEditModal}
        onSubmit={onUpdateContact}
        customFields={localCustomFields}
      />

      <ContactDeleteModal
        isOpen={isDeleteModalOpen}
        deleteTarget={deleteTarget}
        selectedCount={selectedIds.size}
        isDeleting={isDeleting}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      <ContactBulkTagsModal
        open={isBulkTagsModalOpen}
        onOpenChange={setIsBulkTagsModalOpen}
        selectedCount={selectedIds.size}
        availableTags={tags}
        onApply={(tagsToAdd, tagsToRemove) => {
          onBulkUpdateTags(tagsToAdd, tagsToRemove, () => setIsBulkTagsModalOpen(false))
        }}
        isLoading={isBulkUpdatingTags}
      />

      <ContactBulkStatusModal
        open={isBulkStatusModalOpen}
        onOpenChange={setIsBulkStatusModalOpen}
        selectedCount={selectedIds.size}
        onApply={(status) => {
          onBulkUpdateStatus(status)
          setIsBulkStatusModalOpen(false)
        }}
        isLoading={isBulkUpdatingStatus}
      />

      <ContactImportModal
        isOpen={isImportModalOpen}
        isImporting={isImporting}
        customFields={localCustomFields}
        onClose={handleCloseImportModal}
        onImport={onImport}
        onCustomFieldCreated={handleCustomFieldCreated}
        onCustomFieldDeleted={handleCustomFieldDeleted}
      />
    </Page>
  );
};
