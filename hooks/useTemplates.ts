import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { templateService, UtilityCategory, GeneratedTemplate, GenerateUtilityParams } from '../services/templateService';
import { manualDraftsService } from '../services/manualDraftsService';
import { Template } from '../types';
import {
  filterTemplates,
  filterByDraftIds,
  filterExcludingIds,
  computeDraftSendStates,
  getDraftBlockReason,
  toggleTemplateSelection,
  selectAllTemplatesByName,
  selectAllGeneratedTemplates,
  clearSelection,
  pruneSelection,
  removeFromSelection,
  type DraftSendState,
} from '@/lib/business/template';
import { CACHE } from '@/lib/constants';
import { UTILITY_CATEGORIES } from '@/lib/template-categories';

// Re-exporta para consumidores externos (backward compatibility)
export { UTILITY_CATEGORIES };

export const useTemplatesController = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'ALL'>('APPROVED');

  // Details Modal State
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [templateDetails, setTemplateDetails] = useState<{
    header?: string | null;
    footer?: string | null;
    buttons?: Array<{ type: string; text: string; url?: string }>;
    headerMediaPreviewUrl?: string | null;
    headerMediaPreviewExpiresAt?: string | null;
    qualityScore?: string | null;
    rejectedReason?: string | null;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [refreshingPreviewNames, setRefreshingPreviewNames] = useState<Set<string>>(new Set());

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  // Multi-select state for bulk operations
  const [selectedMetaTemplates, setSelectedMetaTemplates] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Multi-select específico para rascunhos manuais (local)
  const [selectedManualDraftIds, setSelectedManualDraftIds] = useState<Set<string>>(new Set())

  // Bulk delete (rascunhos manuais)
  const [isBulkDeleteDraftsModalOpen, setIsBulkDeleteDraftsModalOpen] = useState(false)

  // Bulk Utility Generator State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkBusinessType, setBulkBusinessType] = useState('');
  const [bulkCategories, setBulkCategories] = useState<UtilityCategory[]>([]);
  const [bulkQuantity, setBulkQuantity] = useState(10);
  const [bulkLanguage, setBulkLanguage] = useState<'pt_BR' | 'en_US' | 'es_ES'>('pt_BR');
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [suggestedBatchName, setSuggestedBatchName] = useState<string>('');
  const [universalUrl, setUniversalUrl] = useState<string>('');
  const [universalPhone, setUniversalPhone] = useState<string>('');

  // --- Queries ---
  // Templates raramente mudam - cache de 10 min, mas pode sincronizar manualmente
  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: templateService.getAll,
    staleTime: CACHE.templates,  // 10 minutos - permite updates automáticos
    gcTime: CACHE.templates * 2, // 20 minutos antes de remover do cache
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Rascunhos manuais: usados para identificar quais itens DRAFT são editáveis/enviáveis via wizard.
  const manualDraftsQuery = useQuery({
    queryKey: ['templates', 'drafts', 'manual'],
    queryFn: manualDraftsService.list,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const normalizeManualTemplateName = (input: string): string => {
    return input
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  const manualDraftIds = useMemo(() => {
    const ids = new Set<string>()
    for (const d of manualDraftsQuery.data || []) ids.add(d.id)
    return ids
  }, [manualDraftsQuery.data])

  const manualDraftSendStateById = useMemo<Record<string, DraftSendState>>(() => {
    return computeDraftSendStates(manualDraftsQuery.data || [])
  }, [manualDraftsQuery.data])

  // Ao trocar abas/filtros, zera seleção para evitar ações em itens "de outra tela".
  useEffect(() => {
    setSelectedMetaTemplates(new Set())
    setSelectedManualDraftIds(new Set())
    setIsBulkDeleteModalOpen(false)
    setIsBulkDeleteDraftsModalOpen(false)
  }, [statusFilter, categoryFilter])

  // Se um rascunho sumir do backend/cache, remove da seleção.
  useEffect(() => {
    setSelectedManualDraftIds(prev => pruneSelection(prev, manualDraftIds))
  }, [manualDraftIds])

  // --- Mutations ---
  const syncMutation = useMutation({
    mutationFn: templateService.sync,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`${count} novo(s) template(s) sincronizado(s) do Meta Business Manager!`);
    }
  });

  // Bulk Utility Generation Mutation
  const generateBulkMutation = useMutation({
    mutationFn: (params: GenerateUtilityParams) => templateService.generateUtilityTemplates(params),
    onSuccess: (result) => {
      setGeneratedTemplates(result.templates);
      setSelectedTemplates(new Set(result.templates.map(t => t.id)));
      setSuggestedBatchName(result.metadata.suggestedTitle || 'Submissão em Lote');
      toast.success(`${result.templates.length} templates gerados com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao gerar templates');
    }
  });

  // Delete Template Mutation
  const deleteMutation = useMutation({
    mutationFn: (name: string) => templateService.delete(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Template "${name}" deletado com sucesso!`);
      setIsDeleteModalOpen(false);
      setTemplateToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao deletar template');
    }
  });

  // Bulk Delete Mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (names: string[]) => templateService.deleteBulk(names),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      if (result.deleted > 0) {
        toast.success(`${result.deleted} template(s) deletado(s) com sucesso!`);
      }
      if (result.failed > 0) {
        result.errors.forEach(err => {
          toast.error(`${err.name}: ${err.error}`);
        });
      }
      setIsBulkDeleteModalOpen(false);
      setSelectedMetaTemplates(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao deletar templates');
    }
  });

  const previewInFlightRef = useRef<Set<string>>(new Set())

  const setPreviewRefreshing = (name: string, active: boolean) => {
    setRefreshingPreviewNames((prev) => {
      const next = new Set(prev)
      if (active) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const updateTemplatePreviewCache = (
    name: string,
    url: string | null | undefined,
    expiresAt: string | null | undefined
  ) => {
    if (!name || !url) return

    queryClient.setQueryData(['templates'], (old: Template[] | undefined) => {
      if (!Array.isArray(old)) return old
      return old.map((t) =>
        t.name === name
          ? { ...t, headerMediaPreviewUrl: url, headerMediaPreviewExpiresAt: expiresAt ?? null }
          : t
      )
    })

    setSelectedTemplate((prev) => {
      if (!prev || prev.name !== name) return prev
      return { ...prev, headerMediaPreviewUrl: url, headerMediaPreviewExpiresAt: expiresAt ?? null }
    })

    setTemplateDetails((prev) => {
      if (!prev) return prev
      return { ...prev, headerMediaPreviewUrl: url, headerMediaPreviewExpiresAt: expiresAt ?? null }
    })
  }

  const hasMediaHeader = (template: Template) => {
    const header = template.components?.find((c) => c.type === 'HEADER')
    const format = header?.format ? String(header.format).toUpperCase() : ''
    return ['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)
  }

  const isPreviewExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false
    return new Date(expiresAt).getTime() <= Date.now()
  }

  const shouldFetchPreview = (template: Template) => {
    if (!hasMediaHeader(template)) return false
    if (!template.headerMediaPreviewUrl) return true
    return isPreviewExpired(template.headerMediaPreviewExpiresAt)
  }

  const ensureTemplatePreview = async (
    template: Template,
    options?: { force?: boolean; silent?: boolean }
  ) => {
    if (!template?.name) return

    const needsFetch = options?.force ? true : shouldFetchPreview(template)
    if (!needsFetch) return

    const inFlight = previewInFlightRef.current
    if (inFlight.has(template.name)) return
    inFlight.add(template.name)

    if (options?.force) {
      setPreviewRefreshing(template.name, true)
    }

    try {
      const details = await templateService.getByName(template.name, {
        refreshPreview: options?.force,
      })
      if (details?.headerMediaPreviewUrl) {
        updateTemplatePreviewCache(
          template.name,
          details.headerMediaPreviewUrl,
          details.headerMediaPreviewExpiresAt ?? null
        )
      }
      if (options?.force && !options?.silent) {
        toast.success('Preview atualizado.')
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : 'Falha ao gerar preview')
      }
    } finally {
      inFlight.delete(template.name)
      if (options?.force) {
        setPreviewRefreshing(template.name, false)
      }
    }
  }

  // --- Manual draft actions (create / submit / delete / clone) ---
  const [submittingManualDraftId, setSubmittingManualDraftId] = useState<string | null>(null)
  const [deletingManualDraftId, setDeletingManualDraftId] = useState<string | null>(null)
  const [cloningTemplateName, setCloningTemplateName] = useState<string | null>(null)

  const createManualDraftMutation = useMutation({
    mutationFn: manualDraftsService.create,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Rascunho "${created.name}" criado!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar rascunho');
    },
  })

  const submitManualDraftMutation = useMutation({
    mutationFn: async (id: string) => manualDraftsService.submit(id),
    onMutate: (id) => {
      setSubmittingManualDraftId(id)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success(`Enviado para a Meta (${res.status || 'PENDING'})`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao enviar para a Meta');
    },
    onSettled: () => {
      setSubmittingManualDraftId(null)
    },
  })

  const submitManualDraft = (id: string) => {
    const blockReason = getDraftBlockReason(manualDraftSendStateById, id)
    if (blockReason) {
      toast.error(blockReason)
      return
    }

    // Se não temos o estado (ex.: drafts ainda carregando), mantém o comportamento atual.
    submitManualDraftMutation.mutate(id)
  }

  const deleteManualDraftMutation = useMutation({
    mutationFn: async (id: string) => manualDraftsService.remove(id),
    onMutate: (id) => {
      setDeletingManualDraftId(id)
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Rascunho excluído');

      setSelectedManualDraftIds(prev => removeFromSelection(prev, id))
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao excluir rascunho');
    },
    onSettled: () => {
      setDeletingManualDraftId(null)
    },
  })

  const bulkDeleteManualDraftsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const errors: Array<{ id: string; error: string }> = []
      let deleted = 0
      for (const id of ids) {
        try {
          // Sequencial para evitar "rajadas" no backend.
          await manualDraftsService.remove(id)
          deleted += 1
        } catch (e) {
          errors.push({
            id,
            error: e instanceof Error ? e.message : 'Falha ao excluir rascunho',
          })
        }
      }
      return { deleted, failed: errors.length, errors }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })

      if (result.deleted > 0) {
        toast.success(`${result.deleted} rascunho(s) excluído(s)`)
      }
      if (result.failed > 0) {
        // Mostra só as primeiras para não spammar.
        for (const err of result.errors.slice(0, 3)) {
          toast.error(`${err.id}: ${err.error}`)
        }
        if (result.errors.length > 3) {
          toast.error(`+${result.errors.length - 3} erro(s) ao excluir rascunhos`)
        }
      }

      setIsBulkDeleteDraftsModalOpen(false)
      setSelectedManualDraftIds(new Set())
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao excluir rascunhos')
    },
  })

  const cloneTemplateMutation = useMutation({
    mutationFn: async (templateName: string) => manualDraftsService.clone(templateName),
    onMutate: (name) => {
      setCloningTemplateName(name)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'drafts', 'manual'] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(`Template clonado como "${result.name}"`)
      // Retorna o ID para o caller poder redirecionar
      return result
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao clonar template')
    },
    onSettled: () => {
      setCloningTemplateName(null)
    },
  })

  // --- Logic ---
  const filteredTemplates = useMemo(() => {
    if (!templatesQuery.data) return [];
    return filterTemplates(templatesQuery.data, {
      searchTerm,
      category: categoryFilter,
      status: statusFilter,
    });
  }, [templatesQuery.data, searchTerm, categoryFilter, statusFilter]);

  const visibleManualDraftTemplates = useMemo(() => {
    return filterByDraftIds(filteredTemplates, manualDraftIds)
  }, [filteredTemplates, manualDraftIds])

  const visibleManualDraftIdList = useMemo(() => {
    return visibleManualDraftTemplates.map((t) => t.id)
  }, [visibleManualDraftTemplates])

  const metaSelectableTemplates = useMemo(() => {
    // Rascunhos manuais não podem entrar em seleção/bulk delete (isso é operação da Meta).
    return filterExcludingIds(filteredTemplates, manualDraftIds)
  }, [filteredTemplates, manualDraftIds])

  // Bulk Utility Handlers - SIMPLIFICADO
  const handleGenerateBulk = () => {
    if (!bulkBusinessType.trim() || bulkBusinessType.length < 10) {
      toast.error('Descreva melhor o que você precisa (mínimo 10 caracteres)');
      return;
    }

    generateBulkMutation.mutate({
      prompt: bulkBusinessType,
      quantity: bulkQuantity,
      language: bulkLanguage
    });
  };

  const handleToggleCategory = (category: UtilityCategory) => {
    setBulkCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleToggleTemplate = (id: string) => {
    setSelectedTemplates(prev => toggleTemplateSelection(prev, id));
  };

  const handleSelectAllTemplates = () => {
    setSelectedTemplates(prev => selectAllGeneratedTemplates(generatedTemplates, prev));
  };

  const handleCopyTemplate = (template: GeneratedTemplate) => {
    navigator.clipboard.writeText(template.content);
    toast.success('Template copiado!');
  };

  // Estado para criação na Meta
  const [isCreatingInMeta, setIsCreatingInMeta] = useState(false);

  const handleExportSelected = async () => {
    const selected = generatedTemplates.filter(t => selectedTemplates.has(t.id));

    if (selected.length === 0) {
      toast.error('Selecione pelo menos um template');
      return;
    }

    setIsCreatingInMeta(true);

    try {
      const templatesToCreate = selected.map(t => ({
        name: t.name,
        content: t.content,
        language: t.language,
        category: 'UTILITY' as const,
        // Incluir variáveis de exemplo se existirem
        ...(t.variables && t.variables.length > 0 && { exampleVariables: t.variables.map((v, i) => `Exemplo ${i + 1}`) }),
        // Incluir header, footer e buttons se existirem
        ...(t.header && { header: t.header }),
        ...(t.footer && { footer: t.footer }),
        ...(t.buttons && t.buttons.length > 0 && { buttons: t.buttons }),
      }));

      const result = await templateService.createBulkInMeta(templatesToCreate);

      if (result.created > 0) {
        toast.success(`${result.created} template(s) criado(s) na Meta!`);
        // Invalida cache para recarregar lista
        queryClient.invalidateQueries({ queryKey: ['templates'] });
      }

      if (result.failed > 0) {
        result.errors.forEach(err => {
          toast.error(`${err.name}: ${err.error}`);
        });
      }

      // Fecha modal se todos criados com sucesso
      if (result.failed === 0) {
        handleCloseBulkModal();
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar templates');
    } finally {
      setIsCreatingInMeta(false);
    }
  };

  const handleCloseBulkModal = () => {
    setIsBulkModalOpen(false);
    setBulkBusinessType('');
    setBulkCategories([]);
    setBulkQuantity(5);
    setGeneratedTemplates([]);
    setSelectedTemplates(new Set());
  };

  // --- Details Modal Handlers ---
  const handleViewDetails = async (template: Template) => {
    setSelectedTemplate(template);
    setIsDetailsModalOpen(true);
    setIsLoadingDetails(true);
    setTemplateDetails(null);

    try {
      const details = await templateService.getByName(template.name);
      if (details?.headerMediaPreviewUrl) {
        updateTemplatePreviewCache(
          template.name,
          details.headerMediaPreviewUrl,
          details.headerMediaPreviewExpiresAt ?? null
        )
      }
      setTemplateDetails({
        header: details.header,
        footer: details.footer,
        buttons: details.buttons,
        headerMediaPreviewUrl: details.headerMediaPreviewUrl || null,
        headerMediaPreviewExpiresAt: details.headerMediaPreviewExpiresAt || null,
        qualityScore: details.qualityScore,
        rejectedReason: details.rejectedReason
      });
    } catch (error) {
      console.error('Error loading details:', error);
      // Ainda mostra o modal com os dados básicos
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedTemplate(null);
    setTemplateDetails(null);
  };

  // --- Delete Handlers ---
  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.name);
    }
  };

  const handleCancelDelete = () => {
    setIsDeleteModalOpen(false);
    setTemplateToDelete(null);
  };

  // --- Multi-select Handlers for Meta Templates ---
  const handleToggleMetaTemplate = (templateName: string) => {
    setSelectedMetaTemplates(prev => toggleTemplateSelection(prev, templateName));
  };

  const handleSelectAllMetaTemplates = () => {
    setSelectedMetaTemplates(prev => selectAllTemplatesByName(metaSelectableTemplates, prev));
  };

  const handleClearSelection = () => {
    setSelectedMetaTemplates(clearSelection());
  };

  const handleBulkDeleteClick = () => {
    if (selectedMetaTemplates.size === 0) {
      toast.error('Selecione pelo menos um template');
      return;
    }
    setIsBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = () => {
    const names = Array.from(selectedMetaTemplates);
    bulkDeleteMutation.mutate(names);
  };

  const handleCancelBulkDelete = () => {
    setIsBulkDeleteModalOpen(false);
  };

  // --- Multi-select Handlers for Manual Drafts (local) ---
  const handleToggleManualDraft = (id: string) => {
    setSelectedManualDraftIds(prev => toggleTemplateSelection(prev, id))
  }

  const handleSelectAllManualDrafts = () => {
    setSelectedManualDraftIds(prev => {
      if (visibleManualDraftIdList.length === 0) return clearSelection()
      if (prev.size === visibleManualDraftIdList.length) return clearSelection()
      return new Set(visibleManualDraftIdList)
    })
  }

  const handleClearManualDraftSelection = () => {
    setSelectedManualDraftIds(clearSelection())
  }

  // Calculate status counts for filter pills
  const statusCounts = useMemo(() => {
    const allTemplates = templatesQuery.data || []
    // Aplica apenas filtro de categoria e busca, não status
    const filteredByCategoryAndSearch = allTemplates.filter(t => {
      if (searchTerm && !t.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false
      return true
    })

    const counts = {
      APPROVED: 0,
      PENDING: 0,
      REJECTED: 0,
      DRAFT: 0,
      ALL: filteredByCategoryAndSearch.length,
    }

    for (const t of filteredByCategoryAndSearch) {
      if (t.status === 'APPROVED') counts.APPROVED++
      else if (t.status === 'PENDING') counts.PENDING++
      else if (t.status === 'REJECTED') counts.REJECTED++
      else if (t.status === 'DRAFT' || manualDraftIds.has(t.id)) counts.DRAFT++
    }

    return counts
  }, [templatesQuery.data, searchTerm, categoryFilter, manualDraftIds])

  return {
    templates: filteredTemplates,
    isLoading: templatesQuery.isLoading,
    isSyncing: syncMutation.isPending,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    statusCounts,
    onSync: () => syncMutation.mutate(),

    // Manual drafts (identificação + ações)
    manualDraftIds,
    isLoadingManualDraftIds: manualDraftsQuery.isLoading,
    manualDraftSendStateById,
    createManualDraft: async (input: { name: string; category?: string; language?: string; parameterFormat?: 'positional' | 'named' }) => {
      const normalized = normalizeManualTemplateName(input.name)
      return await createManualDraftMutation.mutateAsync({
        ...input,
        name: normalized,
      })
    },
    isCreatingManualDraft: createManualDraftMutation.isPending,
    submitManualDraft,
    submittingManualDraftId,
    deleteManualDraft: (id: string) => deleteManualDraftMutation.mutate(id),
    deletingManualDraftId,
    cloneTemplate: async (templateName: string) => {
      return await cloneTemplateMutation.mutateAsync(templateName)
    },
    cloningTemplateName,

    // Bulk Utility Generator Props
    isBulkModalOpen,
    setIsBulkModalOpen,
    bulkBusinessType,
    setBulkBusinessType,
    bulkCategories,
    bulkQuantity,
    setBulkQuantity,
    bulkLanguage,
    setBulkLanguage,
    generatedTemplates,
    selectedTemplates,
    suggestedBatchName,
    universalUrl,
    setUniversalUrl,
    universalPhone,
    setUniversalPhone,
    isBulkGenerating: generateBulkMutation.isPending,
    isCreatingInMeta,
    onGenerateBulk: handleGenerateBulk,
    onToggleCategory: handleToggleCategory,
    onToggleTemplate: handleToggleTemplate,
    onSelectAllTemplates: handleSelectAllTemplates,
    onCopyTemplate: handleCopyTemplate,
    onExportSelected: handleExportSelected,
    onCloseBulkModal: handleCloseBulkModal,

    // Details Modal Props
    selectedTemplate,
    isDetailsModalOpen,
    templateDetails,
    isLoadingDetails,
    onViewDetails: handleViewDetails,
    onCloseDetails: handleCloseDetails,
    refreshingPreviewNames,
    onPrefetchPreview: (template: Template) => {
      if (!template) return
      ensureTemplatePreview(template, { silent: true })
    },
    onRefreshPreview: (template: Template) => {
      if (!template) return
      ensureTemplatePreview(template, { force: true })
    },

    // Delete Modal Props
    isDeleteModalOpen,
    templateToDelete,
    isDeleting: deleteMutation.isPending,
    onDeleteClick: handleDeleteClick,
    onConfirmDelete: handleConfirmDelete,
    onCancelDelete: handleCancelDelete,

    // Multi-select & Bulk Delete Props
    selectedMetaTemplates,
    onToggleMetaTemplate: handleToggleMetaTemplate,
    onSelectAllMetaTemplates: handleSelectAllMetaTemplates,
    onClearSelection: handleClearSelection,
    isBulkDeleteModalOpen,
    isBulkDeleting: bulkDeleteMutation.isPending,
    onBulkDeleteClick: handleBulkDeleteClick,
    onConfirmBulkDelete: handleConfirmBulkDelete,
    onCancelBulkDelete: handleCancelBulkDelete,

    // Multi-select de rascunhos manuais (local)
    selectedManualDraftIds,
    onToggleManualDraft: handleToggleManualDraft,
    onSelectAllManualDrafts: handleSelectAllManualDrafts,
    onClearManualDraftSelection: handleClearManualDraftSelection,

    // Bulk delete de rascunhos manuais (local)
    isBulkDeleteDraftsModalOpen,
    setIsBulkDeleteDraftsModalOpen,
    isBulkDeletingDrafts: bulkDeleteManualDraftsMutation.isPending,
    onConfirmBulkDeleteDrafts: (ids: string[]) => {
      if (!ids.length) {
        toast.error('Nenhum rascunho para excluir')
        return
      }
      bulkDeleteManualDraftsMutation.mutate(ids)
    },
  };
};
