'use client';

import React, { useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertCircle,
  Braces,
  Check,
  Circle,
  ExternalLink,
  Eye,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { Template, CustomFieldDefinition } from '@/types';

// Types for template variables
interface TemplateVariableInfo {
  header: Array<{ index: number; key: string; placeholder: string; context: string }>;
  body: Array<{ index: number; key: string; placeholder: string; context: string }>;
  buttons: Array<{ index: number; key: string; buttonIndex: number; buttonText: string; context: string }>;
  totalExtra: number;
}

interface TemplateVariables {
  header: string[];
  body: string[];
  buttons?: Record<string, string>;
  headerLocation?: {
    latitude: string;
    longitude: string;
    name: string;
    address: string;
  };
}

export interface StepTemplateConfigProps {
  // Campaign name
  name: string;
  setName: (name: string) => void;

  // Template selection
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  availableTemplates: Template[];
  selectedTemplate?: Template;

  // Template variables
  templateVariableInfo?: TemplateVariableInfo | null;
  templateVariables: TemplateVariables;
  setTemplateVariables: (vars: TemplateVariables) => void;

  // UI state from hook
  templateCategoryFilter: 'ALL' | 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO';
  setTemplateCategoryFilter: (filter: 'ALL' | 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO') => void;
  templateSearch: string;
  setTemplateSearch: (search: string) => void;
  hoveredTemplateId: string | null;
  setHoveredTemplateId: (id: string | null) => void;

  // Custom fields
  customFields: CustomFieldDefinition[];
  setIsFieldsSheetOpen: (open: boolean) => void;
}

export function StepTemplateConfig({
  name,
  setName,
  selectedTemplateId,
  setSelectedTemplateId,
  availableTemplates,
  selectedTemplate,
  templateVariableInfo,
  templateVariables,
  setTemplateVariables,
  templateCategoryFilter,
  setTemplateCategoryFilter,
  templateSearch,
  setTemplateSearch,
  hoveredTemplateId,
  setHoveredTemplateId,
  customFields,
  setIsFieldsSheetOpen,
}: StepTemplateConfigProps) {
  // Filter templates based on search (or show only selected if one is chosen)
  const filteredTemplates = useMemo(() => {
    const normalizeToken = (v: unknown) =>
      String(v ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        // eslint-disable-next-line no-control-regex
        .replace(/\p{Diacritic}/gu, '');

    const canonicalCategory = (v: unknown) => {
      const raw = normalizeToken(v);
      if (raw === 'UTILITY') return 'UTILIDADE';
      if (raw === 'AUTHENTICATION') return 'AUTENTICACAO';
      if (raw === 'TRANSACTIONAL') return 'UTILIDADE';
      if (raw === 'MARKETING') return 'MARKETING';
      if (raw === 'UTILIDADE') return 'UTILIDADE';
      if (raw === 'AUTENTICACAO') return 'AUTENTICACAO';
      return raw;
    };

    if (selectedTemplateId) {
      return availableTemplates.filter(t => t.id === selectedTemplateId);
    }

    const byCategory = templateCategoryFilter === 'ALL'
      ? availableTemplates
      : availableTemplates.filter(t => canonicalCategory(t.category) === templateCategoryFilter);

    if (!templateSearch.trim()) {
      return byCategory;
    }
    const search = templateSearch.toLowerCase();
    return byCategory.filter(t =>
      t.name.toLowerCase().includes(search) ||
      t.content.toLowerCase().includes(search) ||
      t.category.toLowerCase().includes(search)
    );
  }, [availableTemplates, templateSearch, selectedTemplateId, templateCategoryFilter]);

  // Detect if template has LOCATION header
  const hasLocationHeader = useMemo(() => {
    if (!selectedTemplate?.components) return false;
    const headerComponent = selectedTemplate.components.find(
      (c: any) => String(c?.type || '').toUpperCase() === 'HEADER'
    );
    return headerComponent?.format?.toUpperCase() === 'LOCATION';
  }, [selectedTemplate]);

  // Check if location fields are filled
  const isLocationFilled = templateVariables.headerLocation?.latitude &&
    templateVariables.headerLocation?.longitude;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-auto p-6">
      {/* Campaign Name */}
      <div>
        <label className="block text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider mb-2 ml-1">
          Nome da Campanha
        </label>
        <input
          type="text"
          className="w-full px-5 py-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none transition-all text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] text-lg font-medium"
          placeholder="ex: Promoção de Verão"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Template Selection */}
      <div>
        <div className="flex items-center justify-between mb-4 ml-1">
          <label className="block text-xs font-bold text-[var(--ds-text-muted)] uppercase tracking-wider">
            Selecione o Template
          </label>
          <PrefetchLink href="/templates" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            <RefreshCw size={12} /> Gerenciar Templates
          </PrefetchLink>
        </div>

        {/* Category filter - only when no template is selected */}
        {!selectedTemplateId && availableTemplates.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] p-1">
              {([
                { id: 'ALL' as const, label: 'Todos', Icon: Circle },
                { id: 'MARKETING' as const, label: 'Marketing', Icon: TrendingUp },
                { id: 'UTILIDADE' as const, label: 'Utilidade', Icon: MessageSquare },
                { id: 'AUTENTICACAO' as const, label: 'Autenticação', Icon: ShieldAlert },
              ]).map(({ id, label, Icon }) => {
                const active = templateCategoryFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTemplateCategoryFilter(id)}
                    aria-pressed={active}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${active
                      ? 'bg-primary-500/20 text-primary-300 ring-1 ring-primary-500/30'
                      : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-[var(--ds-text-muted)]">Filtre por tipo</span>
          </div>
        )}

        {/* Search bar - only show when no template is selected */}
        {!selectedTemplateId && availableTemplates.length > 3 && (
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" size={16} />
            <input
              type="text"
              placeholder="Buscar template por nome ou conteúdo..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none transition-all text-[var(--ds-text-primary)] placeholder-[var(--ds-text-muted)] text-sm"
            />
            {templateSearch && (
              <button
                onClick={() => setTemplateSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Selected template indicator with change button */}
        {selectedTemplateId && (
          <div className="mb-4 flex items-center justify-between p-3 bg-primary-500/10 border border-primary-500/30 rounded-xl">
            <div className="flex items-center gap-2">
              <Check className="text-primary-400" size={16} />
              <span className="text-sm text-primary-400">Template selecionado</span>
            </div>
            <button
              onClick={() => {
                setSelectedTemplateId('');
                setTemplateSearch('');
              }}
              className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors flex items-center gap-1"
            >
              <RefreshCw size={12} /> Trocar template
            </button>
          </div>
        )}

        {/* Template List */}
        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
          {availableTemplates.length === 0 && (
            <div className="text-center p-8 border border-dashed border-[var(--ds-border-default)] rounded-xl">
              <p className="text-[var(--ds-text-muted)] mb-2">Nenhum template aprovado encontrado.</p>
              <PrefetchLink href="/templates" className="text-primary-400 text-sm hover:underline">
                Sincronizar Templates
              </PrefetchLink>
            </div>
          )}

          {filteredTemplates.length === 0 && availableTemplates.length > 0 && !selectedTemplateId && templateSearch.trim() && (
            <div className="text-center p-8 border border-dashed border-[var(--ds-border-default)] rounded-xl">
              <p className="text-[var(--ds-text-muted)] mb-2">Nenhum template encontrado para &ldquo;{templateSearch}&rdquo;</p>
              <button
                onClick={() => setTemplateSearch('')}
                className="text-primary-400 text-sm hover:underline"
              >
                Limpar busca
              </button>
            </div>
          )}

          {filteredTemplates.length === 0 && availableTemplates.length > 0 && !selectedTemplateId && !templateSearch.trim() && templateCategoryFilter !== 'ALL' && (
            <div className="text-center p-8 border border-dashed border-[var(--ds-border-default)] rounded-xl">
              <p className="text-[var(--ds-text-muted)] mb-2">
                Nenhum template de <span className="text-[var(--ds-text-primary)]">
                  {templateCategoryFilter === 'AUTENTICACAO' ? 'Autenticação' : templateCategoryFilter === 'UTILIDADE' ? 'Utilidade' : 'Marketing'}
                </span> encontrado.
              </p>
              <button
                onClick={() => setTemplateCategoryFilter('ALL')}
                className="text-primary-400 text-sm hover:underline"
              >
                Ver todos
              </button>
            </div>
          )}

          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTemplateId(t.id)}
              onMouseEnter={() => setHoveredTemplateId(t.id)}
              onMouseLeave={() => setHoveredTemplateId(null)}
              className={`relative border rounded-xl p-4 cursor-pointer transition-all duration-200 group flex items-start gap-4 ${selectedTemplateId === t.id
                ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500'
                : hoveredTemplateId === t.id
                  ? 'border-primary-400/50 bg-primary-500/5'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-surface)]'
              }`}
            >
              {/* Radio indicator */}
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${selectedTemplateId === t.id
                ? 'border-primary-500 bg-primary-500'
                : 'border-[var(--ds-border-default)] bg-transparent group-hover:border-[var(--ds-border-strong)]'
              }`}>
                {selectedTemplateId === t.id && (
                  <div className="w-2 h-2 rounded-full bg-[var(--ds-bg-base)]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-semibold text-sm truncate ${selectedTemplateId === t.id ? 'text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-secondary)]'}`}>
                    {t.name}
                  </h3>
                  <span className="text-[10px] text-[var(--ds-text-muted)] font-mono uppercase tracking-wider ml-2 shrink-0">
                    {t.category}
                  </span>
                </div>
                <p className={`text-sm line-clamp-2 leading-relaxed transition-colors ${selectedTemplateId === t.id ? 'text-[var(--ds-text-secondary)]' : 'text-[var(--ds-text-muted)] group-hover:text-[var(--ds-text-secondary)]'}`}>
                  {t.content.split(/(\{\{.*?\}\})/).map((part, i) =>
                    part.match(/^\{\{.*?\}\}$/) ? (
                      <span key={i} className="font-medium text-primary-400/80">{part}</span>
                    ) : (
                      part
                    )
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Template Variables Section - Shows when template has extra variables */}
      {selectedTemplate && templateVariableInfo && templateVariableInfo.totalExtra > 0 && (
        <div className="mt-8 p-6 bg-primary-500/5 border border-primary-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Sparkles className="text-primary-400" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--ds-text-primary)]">Variáveis do Template</h3>
              <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                Preencha os valores ou use <span className="text-amber-400 font-medium">tokens dinâmicos</span> clicando em <span className="text-amber-400 font-mono text-[11px]">{'{ }'}</span>.
                Tokens como <span className="font-mono text-amber-400 text-[11px]">{'{{nome}}'}</span> são substituídos pelo dado de cada contato no envio.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* HEADER Variables */}
            {templateVariableInfo.header.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--ds-text-muted)] uppercase font-bold tracking-wider flex items-center gap-2">
                  <Eye size={14} /> Variáveis do Cabeçalho
                </p>
                {templateVariableInfo.header.map((varInfo, idx) => (
                  <div key={`header-${idx}`} className="flex items-center gap-3">
                    <span className="w-12 text-center text-xs font-mono bg-amber-500/20 text-amber-400 px-1.5 py-1 rounded shrink-0">
                      {varInfo.placeholder}
                    </span>
                    <div className="flex-1 relative flex items-center">
                      <input
                        type="text"
                        value={templateVariables.header[idx] || ''}
                        onChange={(e) => {
                          const newHeader = [...templateVariables.header];
                          newHeader[idx] = e.target.value;
                          setTemplateVariables({ ...templateVariables, header: newHeader });
                        }}
                        placeholder={varInfo.context}
                        className="w-full pl-4 pr-10 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
                      />
                      <VariablePicker
                        customFields={customFields}
                        onSelect={(value) => {
                          const newHeader = [...templateVariables.header];
                          newHeader[idx] = value;
                          setTemplateVariables({ ...templateVariables, header: newHeader });
                        }}
                        onManageFields={() => setIsFieldsSheetOpen(true)}
                      />
                    </div>
                    {!templateVariables.header[idx] ? (
                      <span className="text-xs text-amber-400">obrigatório</span>
                    ) : (
                      <Check size={16} className="text-primary-400" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* BODY Variables */}
            {templateVariableInfo.body.length > 0 && (
              <div className={`space-y-2 ${templateVariableInfo.header.length > 0 ? 'pt-2 border-t border-[var(--ds-border-subtle)]' : ''}`}>
                <p className="text-xs text-[var(--ds-text-muted)] uppercase font-bold tracking-wider flex items-center gap-2">
                  <MessageSquare size={14} /> Variáveis do Corpo
                </p>
                {templateVariableInfo.body.map((varInfo, idx) => {
                  const value = templateVariables.body[idx] || '';
                  return (
                    <div key={`body-${idx}`} className="flex items-center gap-3">
                      <span className="w-12 text-center text-xs font-mono bg-amber-500/20 text-amber-400 px-1.5 py-1 rounded shrink-0">
                        {varInfo.placeholder}
                      </span>
                      <div className="flex-1 relative flex items-center">
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => {
                            const newBody = [...templateVariables.body];
                            newBody[idx] = e.target.value;
                            setTemplateVariables({ ...templateVariables, body: newBody });
                          }}
                          placeholder={varInfo.context}
                          className="w-full pl-4 pr-10 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
                        />
                        <VariablePicker
                          customFields={customFields}
                          onSelect={(val) => {
                            const newBody = [...templateVariables.body];
                            newBody[idx] = val;
                            setTemplateVariables({ ...templateVariables, body: newBody });
                          }}
                          onManageFields={() => setIsFieldsSheetOpen(true)}
                        />
                      </div>
                      {!value ? (
                        <span className="text-xs text-amber-400">obrigatório</span>
                      ) : (
                        <Check size={16} className="text-primary-400" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* BUTTON URL Variables */}
            {templateVariableInfo.buttons.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--ds-border-subtle)]">
                <p className="text-xs text-[var(--ds-text-muted)] uppercase font-bold tracking-wider flex items-center gap-2">
                  <ExternalLink size={12} /> URLs Dinâmicas dos Botões
                </p>
                {templateVariableInfo.buttons.map((varInfo) => (
                  <div key={`button-${varInfo.buttonIndex}`} className="flex items-center gap-3">
                    <span className="w-auto min-w-12 text-center text-xs font-mono bg-amber-500/20 text-amber-400 px-2 py-1.5 rounded">
                      {`Botão ${varInfo.buttonIndex + 1}`}
                    </span>
                    <input
                      type="text"
                      value={templateVariables.buttons?.[`button_${varInfo.buttonIndex}_0`] || ''}
                      onChange={(e) => {
                        setTemplateVariables({
                          ...templateVariables,
                          buttons: {
                            ...templateVariables.buttons,
                            [`button_${varInfo.buttonIndex}_0`]: e.target.value
                          }
                        });
                      }}
                      placeholder={`Parte dinâmica da URL do botão "${varInfo.buttonText}"`}
                      className="flex-1 px-4 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
                    />
                    {!templateVariables.buttons?.[`button_${varInfo.buttonIndex}_0`] ? (
                      <span className="text-xs text-amber-400">obrigatório</span>
                    ) : (
                      <Check size={16} className="text-amber-400" />
                    )}
                  </div>
                ))}
                <p className="text-xs text-[var(--ds-text-muted)] mt-1 flex items-center gap-1.5 pl-1">
                  <AlertCircle size={11} />
                  Ex: Se a URL é <code className="bg-[var(--ds-bg-elevated)] px-1 rounded">zoom.us/j/{'{{1}}'}</code>, preencha apenas o ID da reunião
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOCATION Header Section - Shows when template has LOCATION header */}
      {selectedTemplate && hasLocationHeader && (
        <div className="mt-8 p-6 bg-blue-500/5 border border-blue-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <MapPin className="text-blue-400" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--ds-text-primary)]">Localização do Cabeçalho</h3>
              <p className="text-xs text-[var(--ds-text-secondary)] mt-1">
                Este template exibe uma localização no cabeçalho. Preencha os dados abaixo.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Latitude & Longitude */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Latitude *</label>
                <input
                  type="text"
                  value={templateVariables.headerLocation?.latitude || ''}
                  onChange={(e) => {
                    setTemplateVariables({
                      ...templateVariables,
                      headerLocation: {
                        latitude: e.target.value,
                        longitude: templateVariables.headerLocation?.longitude || '',
                        name: templateVariables.headerLocation?.name || '',
                        address: templateVariables.headerLocation?.address || '',
                      },
                    });
                  }}
                  placeholder="Ex: -23.5505"
                  className="w-full px-4 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Longitude *</label>
                <input
                  type="text"
                  value={templateVariables.headerLocation?.longitude || ''}
                  onChange={(e) => {
                    setTemplateVariables({
                      ...templateVariables,
                      headerLocation: {
                        latitude: templateVariables.headerLocation?.latitude || '',
                        longitude: e.target.value,
                        name: templateVariables.headerLocation?.name || '',
                        address: templateVariables.headerLocation?.address || '',
                      },
                    });
                  }}
                  placeholder="Ex: -46.6333"
                  className="w-full px-4 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Nome do Local</label>
              <input
                type="text"
                value={templateVariables.headerLocation?.name || ''}
                onChange={(e) => {
                  setTemplateVariables({
                    ...templateVariables,
                    headerLocation: {
                      latitude: templateVariables.headerLocation?.latitude || '',
                      longitude: templateVariables.headerLocation?.longitude || '',
                      name: e.target.value,
                      address: templateVariables.headerLocation?.address || '',
                    },
                  });
                }}
                placeholder="Ex: Loja Centro"
                className="w-full px-4 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
              />
            </div>

            {/* Address */}
            <div>
              <label className="text-xs text-[var(--ds-text-muted)] mb-1 block">Endereço</label>
              <input
                type="text"
                value={templateVariables.headerLocation?.address || ''}
                onChange={(e) => {
                  setTemplateVariables({
                    ...templateVariables,
                    headerLocation: {
                      latitude: templateVariables.headerLocation?.latitude || '',
                      longitude: templateVariables.headerLocation?.longitude || '',
                      name: templateVariables.headerLocation?.name || '',
                      address: e.target.value,
                    },
                  });
                }}
                placeholder="Ex: Av. Paulista, 1000 - São Paulo, SP"
                className="w-full px-4 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none transition-all text-[var(--ds-text-primary)] text-sm placeholder-[var(--ds-text-muted)]"
              />
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 pt-2">
              {isLocationFilled ? (
                <>
                  <Check size={16} className="text-primary-400" />
                  <span className="text-xs text-primary-400">Localização configurada</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-400">Latitude e Longitude são obrigatórios</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component: Variable Picker Dropdown
interface VariablePickerProps {
  customFields: CustomFieldDefinition[];
  onSelect: (value: string) => void;
  onManageFields: () => void;
}

function VariablePicker({ customFields, onSelect, onManageFields }: VariablePickerProps) {
  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1 hover:bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] hover:text-amber-400 rounded-md transition-colors outline-none"
            title="Inserir Variável Dinâmica"
          >
            <Braces size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-[var(--ds-bg-elevated)] border-[var(--ds-border-default)] text-[var(--ds-text-primary)] min-w-50">
          <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider px-2 py-1.5">
            Dados do Contato
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
            onClick={() => onSelect('{{nome}}')}
          >
            <Users size={14} className="text-indigo-400" />
            <span>Nome</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
            onClick={() => onSelect('{{telefone}}')}
          >
            <div className="text-green-400 font-mono text-[10px] w-3.5 text-center">Ph</div>
            <span>Telefone</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
            onClick={() => onSelect('{{email}}')}
          >
            <div className="text-blue-400 font-mono text-[10px] w-3.5 text-center">@</div>
            <span>Email</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-[var(--ds-border-default)] my-1" />

          {customFields.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wider px-2 py-1.5 mt-2">
                Campos Personalizados
              </DropdownMenuLabel>
              {customFields.map(field => (
                <DropdownMenuItem
                  key={field.id}
                  className="text-sm cursor-pointer hover:bg-[var(--ds-bg-hover)] focus:bg-[var(--ds-bg-hover)] px-2 py-1.5 rounded-sm flex items-center gap-2 outline-none"
                  onClick={() => onSelect(`{{${field.key}}}`)}
                >
                  <div className="text-amber-400 font-mono text-[10px] w-3.5 text-center">#</div>
                  <span>{field.label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-[var(--ds-border-default)] my-1" />
            </>
          )}

          <DropdownMenuItem
            className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1.5 cursor-pointer flex items-center gap-2"
            onSelect={(e) => {
              e.preventDefault();
              onManageFields();
            }}
          >
            <Plus size={12} /> Gerenciar Campos
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
