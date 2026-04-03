import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { contactService } from '../services';
import { Contact, ContactStatus } from '../types';
import { customFieldService } from '../services/customFieldService';
import { PAGINATION, CACHE } from '@/lib/constants';
import { invalidateContacts } from '@/lib/query-invalidation';
import {
  normalizeEmailForUpdate,
  sanitizeCustomFieldsForUpdate,
} from '@/lib/business/contact';
import { useContactSelection } from './useContactSelection';
import type { ContactsInitialData } from '@/app/(dashboard)/contacts/actions';

// =============================================================================
// QUERY KEY HELPERS - Normalized for consistency
// =============================================================================

interface ContactsQueryParams {
  page: number
  search: string
  status: ContactStatus | 'ALL' | 'SUPPRESSED'
  tag: string
}

/**
 * Creates a normalized query key for contacts list
 * Ensures consistent cache hits regardless of parameter order
 */
const createContactsQueryKey = (params: ContactsQueryParams) => [
  'contacts',
  {
    page: params.page,
    search: (params.search || '').trim().toLowerCase(),
    status: params.status || 'ALL',
    tag: params.tag || 'ALL',
  }
] as const;

export const useContactsController = (initialData?: ContactsInitialData) => {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // Em alguns ambientes de teste o mock pode retornar null/undefined.
  const editFromUrl = (searchParams as any)?.get?.('edit') as string | null;

  // UI State - Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'ALL' | 'SUPPRESSED'>('ALL');
  const [tagFilter, setTagFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'bulk'; id?: string } | null>(null);

  // Import State
  const [importReport, setImportReport] = useState<string | null>(null);

  // --- Queries ---
  // Query key normalizada para consistência de cache
  const queryParams: ContactsQueryParams = {
    page: currentPage,
    search: searchTerm,
    status: statusFilter,
    tag: tagFilter,
  };
  const contactsQueryKey = createContactsQueryKey(queryParams);

  // Se temos initialData e estamos na página 1 sem filtros, usamos como dados iniciais
  const isFirstPageNoFilters = currentPage === 1 && !searchTerm.trim() && statusFilter === 'ALL' && tagFilter === 'ALL'
  const contactsInitial = isFirstPageNoFilters && initialData
    ? { data: initialData.contacts, total: initialData.total }
    : undefined

  const contactsQuery = useQuery({
    queryKey: contactsQueryKey,
    queryFn: () => contactService.list({
      limit: PAGINATION.contacts,
      offset: (currentPage - 1) * PAGINATION.contacts,
      search: searchTerm.trim(),
      status: statusFilter,
      tag: tagFilter,
    }),
    initialData: contactsInitial,
    staleTime: CACHE.contacts,
    placeholderData: keepPreviousData,
  });

  const contactByIdQuery = useQuery({
    queryKey: ['contact', editFromUrl],
    enabled: !!editFromUrl,
    queryFn: () => contactService.getById(editFromUrl!),
  });

  // Deep-link: /contacts?edit=<id> abre o modal de edição do contato.
  useEffect(() => {
    if (!editFromUrl) return;
    const contactFromPage = contactsQuery.data?.data?.find(c => c.id === editFromUrl);
    const contact = contactFromPage || contactByIdQuery.data;
    if (!contact) return;

    setEditingContact(contact);
    setIsEditModalOpen(true);
  }, [editFromUrl, contactsQuery.data, contactByIdQuery.data]);

  const statsQuery = useQuery({
    queryKey: ['contactStats'],
    queryFn: contactService.getStats,
    initialData: initialData?.stats ? {
      total: initialData.stats.total,
      optIn: initialData.stats.active,
      optOut: initialData.stats.optOut
    } : undefined,
    staleTime: CACHE.stats
  });

  const tagsQuery = useQuery({
    queryKey: ['contactTags'],
    queryFn: contactService.getTags,
    initialData: initialData?.tags,
    staleTime: CACHE.stats,
  });

  const customFieldsQuery = useQuery({
    queryKey: ['customFields'],
    queryFn: () => customFieldService.getAll(),
    initialData: initialData?.customFields,
    staleTime: CACHE.customFields
  });

  const refreshCustomFields = () => {
    queryClient.invalidateQueries({ queryKey: ['customFields'] });
  };

  // NOTA: Realtime agora é gerenciado pelo CentralizedRealtimeProvider
  // que invalida queries automaticamente via debounce

  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: contactService.add,
    onSuccess: () => {
      invalidateContacts(queryClient);
      setIsAddModalOpen(false);
      toast.success('Contato adicionado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar contato');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Contact, 'id'>> }) =>
      contactService.update(id, data),
    // Optimistic update: atualiza UI imediatamente
    onMutate: async ({ id, data }) => {
      // Cancela queries em andamento para evitar overwrites
      await queryClient.cancelQueries({ queryKey: ['contacts'] });
      await queryClient.cancelQueries({ queryKey: ['contact', id] });

      // Snapshot do estado anterior para rollback
      const previousContacts = queryClient.getQueryData(contactsQueryKey);
      const previousContact = queryClient.getQueryData(['contact', id]);

      // Optimistic update na lista
      queryClient.setQueryData(contactsQueryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((c: Contact) =>
            c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c
          ),
        };
      });

      // Optimistic update no contato individual
      queryClient.setQueryData(['contact', id], (old: Contact | undefined) =>
        old ? { ...old, ...data, updatedAt: new Date().toISOString() } : old
      );

      return { previousContacts, previousContact };
    },
    onSuccess: (updated) => {
      // Atualiza cache com dados reais do servidor
      if (updated) {
        queryClient.setQueryData(['contact', updated.id], updated);
      }
      // Invalida apenas stats (lista já foi atualizada)
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });

      setIsEditModalOpen(false);
      setEditingContact(null);
      toast.success('Contato atualizado com sucesso!');
    },
    onError: (error: any, { id }, context) => {
      // Rollback em caso de erro
      if (context?.previousContacts) {
        queryClient.setQueryData(contactsQueryKey, context.previousContacts);
      }
      if (context?.previousContact) {
        queryClient.setQueryData(['contact', id], context.previousContact);
      }
      toast.error(error.message || 'Erro ao atualizar contato');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contactService.delete,
    // Optimistic delete: remove da UI imediatamente
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['contacts'] });

      const previousContacts = queryClient.getQueryData(contactsQueryKey);

      // Remove contato da lista otimisticamente
      queryClient.setQueryData(contactsQueryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((c: Contact) => c.id !== id),
          total: Math.max(0, (old.total || 0) - 1),
        };
      });

      return { previousContacts };
    },
    onSuccess: () => {
      // Invalida stats após confirmação do servidor
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });

      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      toast.success('Contato excluído com sucesso!');
    },
    onError: (error: any, _id, context) => {
      // Rollback em caso de erro
      if (context?.previousContacts) {
        queryClient.setQueryData(contactsQueryKey, context.previousContacts);
      }
      toast.error(error.message || 'Erro ao excluir contato');
    },
  });

  const deleteManyMutation = useMutation({
    mutationFn: contactService.deleteMany,
    // Optimistic bulk delete
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['contacts'] });

      const previousContacts = queryClient.getQueryData(contactsQueryKey);
      const idsSet = new Set(ids);

      // Remove contatos da lista otimisticamente
      queryClient.setQueryData(contactsQueryKey, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((c: Contact) => !idsSet.has(c.id)),
          total: Math.max(0, (old.total || 0) - ids.length),
        };
      });

      return { previousContacts };
    },
    onSuccess: (count) => {
      // Invalida stats após confirmação do servidor
      queryClient.invalidateQueries({ queryKey: ['contactStats'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });

      setSelectedIds(new Set());
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      toast.success(`${count} contatos excluídos com sucesso!`);
    },
    onError: (error: any, _ids, context) => {
      // Rollback em caso de erro
      if (context?.previousContacts) {
        queryClient.setQueryData(contactsQueryKey, context.previousContacts);
      }
      toast.error(error.message || 'Erro ao excluir contatos');
    },
  });

  const bulkUpdateTagsMutation = useMutation({
    mutationFn: ({
      ids,
      tagsToAdd,
      tagsToRemove,
    }: {
      ids: string[]
      tagsToAdd: string[]
      tagsToRemove: string[]
    }) => contactService.bulkUpdateTags(ids, tagsToAdd, tagsToRemove),
    onSuccess: () => {
      invalidateContacts(queryClient)
      clearSelection()
      toast.success('Tags atualizadas com sucesso')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ContactStatus }) =>
      contactService.bulkUpdateStatus(ids, status),
    onSuccess: () => {
      invalidateContacts(queryClient)
      clearSelection()
      toast.success('Status atualizado com sucesso')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const importMutation = useMutation({
    mutationFn: contactService.import,
    onSuccess: (result) => {
      invalidateContacts(queryClient);
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted} novos`);
      if (result.updated > 0) parts.push(`${result.updated} atualizados`);
      toast.success(`Importação concluída: ${parts.join(', ') || '0 contatos'}`);
    },
    onError: () => toast.error('Erro ao importar contatos')
  });

  // New: Import from file with validation report
  const importFromFileMutation = useMutation({
    mutationFn: (file: File) => contactService.importFromFile(file),
    onSuccess: (result) => {
      invalidateContacts(queryClient);
      setImportReport(result.report);
      if (result.imported > 0) {
        toast.success(`${result.imported} contatos importados!`);
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} contatos inválidos (ver relatório)`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao importar contatos');
    }
  });

  // Unsuppress mutation - remove supressão global de um telefone
  const unsuppressMutation = useMutation({
    mutationFn: contactService.unsuppress,
    onSuccess: () => {
      invalidateContacts(queryClient);
      toast.success('Supressão removida! O contato pode receber mensagens novamente.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao remover supressão');
    }
  });

  // --- Filtering & Pagination Logic (server-side) ---
  const contacts = contactsQuery.data?.data || [];
  const totalFiltered = contactsQuery.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGINATION.contacts));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Reset page when filters change - memoizados para evitar re-renders
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    setCurrentPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((status: ContactStatus | 'ALL' | 'SUPPRESSED') => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  const handleTagFilterChange = useCallback((tag: string) => {
    setTagFilter(tag);
    setCurrentPage(1);
  }, []);

  // --- Selection Logic (extracted to reusable hook) ---
  const pageContactIds = useMemo(() => contacts.map(c => c.id), [contacts]);
  const selectionFilters = useMemo(
    () => ({ search: searchTerm, status: statusFilter, tag: tagFilter }),
    [searchTerm, statusFilter, tagFilter]
  );
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    selectAllGlobal,
    clearSelection,
    isAllSelected,
    isSomeSelected,
  } = useContactSelection(pageContactIds, selectionFilters);

  // --- Handlers - memoizados para evitar re-renders ---
  const handleAddContact = useCallback((contact: { name: string; phone: string; email?: string; tags: string; custom_fields?: Record<string, any> }) => {
    if (!contact.phone) {
      toast.error('Telefone é obrigatório');
      return;
    }

    // Validate phone before submitting
    const validation = contactService.validatePhone(contact.phone);
    if (!validation.isValid) {
      toast.error(validation.error || 'Número de telefone inválido');
      return;
    }

    addMutation.mutate({
      name: contact.name || 'Desconhecido',
      phone: contact.phone,
      email: contact.email || undefined,
      status: ContactStatus.OPT_IN,
      tags: contact.tags.split(',').map(t => t.trim()).filter(t => t),
      custom_fields: contact.custom_fields
    });
  }, [addMutation.mutate]);

  const handleEditContact = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setIsEditModalOpen(true);
  }, []);

  const handleUpdateContact = useCallback((data: { name: string; phone: string; email?: string; tags: string; status: ContactStatus; custom_fields?: Record<string, any> }) => {
    if (!editingContact) return;
    updateMutation.mutate({
      id: editingContact.id,
      data: {
        name: data.name,
        phone: data.phone,
        // Para "apagar" email, precisamos enviar null (undefined não altera no banco)
        email: normalizeEmailForUpdate(data.email),
        status: data.status,
        tags: data.tags.split(',').map(t => t.trim()).filter(t => t),
        custom_fields: sanitizeCustomFieldsForUpdate(data.custom_fields)
      }
    });
  }, [editingContact, updateMutation.mutate]);

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteTarget({ type: 'single', id });
    setIsDeleteModalOpen(true);
  }, []);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteTarget({ type: 'bulk' });
    setIsDeleteModalOpen(true);
  }, [selectedIds.size]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'single' && deleteTarget.id) {
      deleteMutation.mutate(deleteTarget.id);
    } else if (deleteTarget.type === 'bulk') {
      deleteManyMutation.mutate(Array.from(selectedIds));
    }
  }, [deleteTarget, deleteMutation.mutate, deleteManyMutation.mutate, selectedIds]);

  const handleCancelDelete = useCallback(() => {
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  }, []);

  const handleUnsuppress = useCallback((phone: string) => {
    unsuppressMutation.mutate(phone);
  }, [unsuppressMutation]);

  return {
    // Data
    contacts,
    stats: statsQuery.data || { total: 0, optIn: 0, optOut: 0 },
    tags: tagsQuery.data || [],
    customFields: customFieldsQuery.data || [],
    isLoading: contactsQuery.isLoading && !contactsQuery.data,

    refreshCustomFields,

    // Filters
    searchTerm,
    setSearchTerm: handleSearchChange,
    statusFilter,
    setStatusFilter: handleStatusFilterChange,
    tagFilter,
    setTagFilter: handleTagFilterChange,

    // Pagination
    currentPage,
    setCurrentPage,
    totalPages,
    totalFiltered,
    itemsPerPage: PAGINATION.contacts,

    // Selection
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    selectAllGlobal,
    clearSelection,
    isAllSelected,
    isSomeSelected,

    // Modals
    isAddModalOpen,
    setIsAddModalOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    isEditModalOpen,
    setIsEditModalOpen,
    isDeleteModalOpen,
    editingContact,
    deleteTarget,

    // Actions
    onAddContact: handleAddContact,
    onEditContact: handleEditContact,
    onUpdateContact: handleUpdateContact,
    onDeleteClick: handleDeleteClick,
    onBulkDeleteClick: handleBulkDeleteClick,
    onConfirmDelete: handleConfirmDelete,
    onCancelDelete: handleCancelDelete,
    onImport: importMutation.mutateAsync,
    onImportFile: importFromFileMutation.mutateAsync,
    isImporting: importMutation.isPending || importFromFileMutation.isPending,
    isDeleting: deleteMutation.isPending || deleteManyMutation.isPending,
    onBulkUpdateTags: (tagsToAdd: string[], tagsToRemove: string[], onDone?: () => void) =>
      bulkUpdateTagsMutation.mutate(
        { ids: Array.from(selectedIds), tagsToAdd, tagsToRemove },
        { onSuccess: onDone }
      ),
    isBulkUpdatingTags: bulkUpdateTagsMutation.isPending,
    onBulkUpdateStatus: (status: ContactStatus) =>
      bulkUpdateStatusMutation.mutate({
        ids: Array.from(selectedIds),
        status,
      }),
    isBulkUpdatingStatus: bulkUpdateStatusMutation.isPending,
    onUnsuppress: handleUnsuppress,

    // Import report
    importReport,
    clearImportReport: useCallback(() => setImportReport(null), []),
  };
};
