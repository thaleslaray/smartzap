'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Braces, Calendar as CalendarIcon, Check, Eye, FolderIcon, Layers, MessageSquare, Plus, RefreshCw, Save, Search, Sparkles, Users, Wand2 } from 'lucide-react'
import { CustomFieldsSheet } from '@/components/features/contacts/CustomFieldsSheet'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TemplatePreviewCard } from '@/components/ui/TemplatePreviewCard'
import { ContactQuickEditModal } from '@/components/features/contacts/ContactQuickEditModal'
import { Calendar } from '@/components/ui/calendar'
import DateTimePicker from '@/components/ui/date-time-picker'
import { ptBRLight as ptBR } from '@/lib/locale-pt-br-light'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useCampaignNewController, steps, formatDateLabel, parsePickerDate } from '@/hooks/useCampaignNew'

export default function CampaignsNewRealPage() {
  const ctrl = useCampaignNewController()
  const [tagSearchOpen, setTagSearchOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="text-xs text-[var(--ds-text-muted)]">App / Campanhas / Novo</div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-[var(--ds-text-primary)]">Criar Campanha</h1>
          </div>
          <p className="text-sm text-[var(--ds-text-muted)]">
            Fluxo simplificado: uma decisao por vez, com contexto sempre visivel.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {steps.map((item) => {
              const isStepEnabled =
                item.id === 1 ||
                (item.id === 2 && ctrl.isConfigComplete) ||
                (item.id === 3 && ctrl.isConfigComplete && ctrl.isAudienceComplete) ||
                (item.id === 4 && ctrl.isConfigComplete && ctrl.isAudienceComplete && ctrl.isPrecheckOk)
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isStepEnabled}
                  onClick={() => {
                    if (!isStepEnabled) return
                    ctrl.setStep(item.id)
                  }}
                  title={
                    isStepEnabled
                      ? undefined
                      : item.id === 2
                        ? 'Complete a configuração para avançar'
                        : item.id === 3
                          ? 'Complete configuração e público para avançar'
                          : 'Finalize a validação para avançar'
                  }
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    ctrl.step === item.id
                      ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-[var(--ds-text-primary)]'
                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
                  } ${!isStepEnabled ? 'cursor-not-allowed opacity-40' : 'hover:text-[var(--ds-text-primary)]'}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 aspect-square place-items-center rounded-full border text-xs font-semibold leading-none ${
                      ctrl.step === item.id
                        ? 'border-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200'
                        : 'border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
                    }`}
                  >
                    {item.id}
                  </span>
                  <span className="text-xs uppercase tracking-widest">{item.label}</span>
                </button>
              )
            })}
          </div>
          {ctrl.step === 1 && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <input
                  className="w-full h-11 flex-1 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                  placeholder="Nome da campanha"
                  value={ctrl.campaignName}
                  onChange={(event) => ctrl.setCampaignName(event.target.value)}
                  aria-label="Nome da campanha"
                />
                <div className="relative w-full lg:w-36">
                  <select
                    className="w-full h-11 appearance-none rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] pl-4 pr-10 text-sm text-[var(--ds-text-primary)]"
                    aria-label="Filtrar por categoria"
                    value={ctrl.categoryFilter}
                    onChange={(e) => ctrl.setCategoryFilter(e.target.value)}
                  >
                    <option value="Todos">Todos</option>
                    <option value="Utilidade">Utilidade</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Autenticacao">Autenticação</option>
                  </select>
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-emerald-700 dark:text-emerald-200">
                    ▾
                  </span>
                </div>
              </div>

              {ctrl.templateSelected ? (
                <div className="flex h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-600 dark:border-emerald-400/40 text-[10px] text-emerald-700 dark:text-emerald-300">
                      ✓
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-[var(--ds-text-primary)]">{ctrl.selectedTemplate?.name}</span>
                      {ctrl.selectedTemplate?.category && (
                        <span className="text-[10px] uppercase tracking-widest text-[var(--ds-text-muted)]">
                          {ctrl.selectedTemplate.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      ctrl.setTemplateSelected(false)
                      ctrl.setPreviewTemplate(null)
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400/80 hover:text-emerald-700 dark:text-emerald-300"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_10px_26px_rgba(0,0,0,0.3)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Template</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">Busque e escolha o template da campanha.</p>
                  </div>

                  <div className="mt-5">
                    <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Buscar template</label>
                    <input
                      className="mt-2 w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                      placeholder="Digite o nome do template..."
                      value={ctrl.templateSearch}
                      onChange={(event) => ctrl.setTemplateSearch(event.target.value)}
                    />
                    {ctrl.templatesQuery.isLoading && (
                      <div className="mt-2 text-xs text-[var(--ds-text-muted)]">Carregando templates...</div>
                    )}
                    {ctrl.templatesQuery.isError && (
                      <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        Falha ao carregar templates. Verifique as credenciais.
                      </div>
                    )}
                    {!ctrl.templatesQuery.isLoading && !ctrl.templatesQuery.isError && ctrl.templateOptions.length === 0 && (
                      <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Nenhum template aprovado encontrado.</div>
                    )}
                  </div>

                  {ctrl.showTemplateResults ? (
                    <div className="mt-5 rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          {ctrl.hasTemplateSearch ? 'Resultados da busca' : 'Todos os templates'}
                        </div>
                        {ctrl.hasTemplateSearch ? (
                          <button
                            type="button"
                            onClick={() => ctrl.setTemplateSearch('')}
                            className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
                          >
                            Limpar busca
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => ctrl.setShowAllTemplates(false)}
                            className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]"
                          >
                            Voltar para recentes
                          </button>
                        )}
                      </div>
                      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-2 text-sm">
                        {ctrl.filteredTemplates.length === 0 ? (
                          <div className="text-xs text-[var(--ds-text-muted)]">Nenhum template encontrado.</div>
                        ) : (
                          ctrl.filteredTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onMouseEnter={() => ctrl.setPreviewTemplate(template)}
                              onMouseLeave={() => ctrl.setPreviewTemplate(null)}
                              onClick={() => {
                                ctrl.setSelectedTemplate(template)
                                ctrl.setTemplateSelected(true)
                                ctrl.setPreviewTemplate(null)
                              }}
                              className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-left text-[var(--ds-text-secondary)] hover:border-emerald-600 dark:hover:border-emerald-400/40"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[var(--ds-text-primary)]">{template.name}</span>
                                <span className="text-[10px] uppercase text-[var(--ds-text-muted)]">{template.category}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                          <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Recentes</div>
                          <div className="mt-3 space-y-2 text-sm">
                            {ctrl.recentTemplates.map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onMouseEnter={() => ctrl.setPreviewTemplate(template)}
                                onMouseLeave={() => ctrl.setPreviewTemplate(null)}
                                onClick={() => {
                                  ctrl.setSelectedTemplate(template)
                                  ctrl.setTemplateSelected(true)
                                  ctrl.setPreviewTemplate(null)
                                }}
                                className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-left text-[var(--ds-text-secondary)] hover:border-emerald-600 dark:hover:border-emerald-400/40"
                              >
                                <div className="font-semibold text-[var(--ds-text-primary)]">{template.name}</div>
                                <div className="mt-1 text-xs text-[var(--ds-text-muted)]">{template.category}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                          <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Recomendados</div>
                          <div className="mt-3 space-y-2 text-sm">
                            {ctrl.recommendedTemplates.map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onMouseEnter={() => ctrl.setPreviewTemplate(template)}
                                onMouseLeave={() => ctrl.setPreviewTemplate(null)}
                                onClick={() => {
                                  ctrl.setSelectedTemplate(template)
                                  ctrl.setTemplateSelected(true)
                                  ctrl.setPreviewTemplate(null)
                                }}
                                className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-left text-[var(--ds-text-secondary)] hover:border-emerald-600 dark:hover:border-emerald-400/40"
                              >
                                <div className="font-semibold text-[var(--ds-text-primary)]">{template.name}</div>
                                <div className="mt-1 text-xs text-[var(--ds-text-muted)]">{template.category}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {!ctrl.showTemplateResults && (
                        <button
                          type="button"
                          onClick={() => ctrl.setShowAllTemplates(true)}
                          className="mt-4 text-xs text-emerald-700 dark:text-emerald-300"
                        >
                          Ver todos os templates
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {ctrl.templateSelected && ctrl.hasTemplateVariables && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-100 dark:bg-emerald-500/10 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Variáveis do Template</h2>
                      <p className="text-sm text-[var(--ds-text-muted)]">
                        Preencha os valores que serão usados neste template. Esses valores serão iguais para todos os destinatários.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-5">
                    {ctrl.templateSpecError && (
                      <div className="rounded-xl border border-amber-400 dark:border-amber-400/30 bg-amber-100 dark:bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
                        <div className="font-semibold">Template com contrato inválido</div>
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-200/80">{ctrl.templateSpecError}</div>
                      </div>
                    )}
                    {ctrl.templateVars.header.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          <Eye size={14} />
                          <span>Variáveis do cabeçalho</span>
                        </div>
                      <div className="space-y-3">
                          {ctrl.templateVars.header.map((item, index) => (
                            <div key={item.key} className="flex items-center gap-3">
                              <span className="rounded-lg bg-amber-100 dark:bg-amber-500/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-200">
                                {item.placeholder}
                              </span>
                              <div className="relative flex flex-1 items-center">
                                <input
                                  value={item.value}
                                  onChange={(event) => ctrl.setTemplateVarValue('header', index, event.target.value)}
                                  placeholder={`Variável do cabeçalho (${item.placeholder})`}
                                  className={`w-full rounded-xl border bg-[var(--ds-bg-elevated)] px-4 py-2 pr-10 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] ${
                                    !item.value.trim() && item.required
                                      ? 'border-amber-400 dark:border-amber-400/40'
                                      : 'border-[var(--ds-border-default)]'
                                  }`}
                                />
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-secondary)] hover:text-amber-700 dark:text-amber-300"
                                    >
                                      <Braces size={14} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-52 border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)]"
                                  >
                                    <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                      Dados do contato
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('header', index, '{{nome}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <Users size={14} className="text-indigo-400" />
                                      <span>Nome</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('header', index, '{{telefone}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <div className="text-green-400 font-mono text-[10px] w-3.5 text-center">Ph</div>
                                      <span>Telefone</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('header', index, '{{email}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <div className="text-blue-400 font-mono text-[10px] w-3.5 text-center">@</div>
                                      <span>E-mail</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                    {ctrl.customFields.length > 0 && (
                                      <>
                                        <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                          Campos personalizados
                                        </DropdownMenuLabel>
                                        {ctrl.customFields.map((field) => (
                                          <DropdownMenuItem
                                            key={field.key}
                                            onSelect={() => ctrl.setTemplateVarValue('header', index, `{{${field.key}}}`)}
                                            className="flex items-center gap-2"
                                          >
                                            <div className="text-amber-600 dark:text-amber-400 font-mono text-[10px] w-3.5 text-center">#</div>
                                            <span>{field.label || field.key}</span>
                                          </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                      </>
                                    )}
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setIsFieldsSheetOpen(true)}
                                      className="text-xs text-amber-600 dark:text-amber-400"
                                    >
                                      <Plus size={12} /> Gerenciar campos
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {item.required && <span className="text-xs text-amber-700 dark:text-amber-300">obrigatório</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {ctrl.templateVars.body.length > 0 && (
                      <div className="space-y-3 border-t border-[var(--ds-border-default)] pt-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          <MessageSquare size={14} />
                          <span>Variáveis do corpo</span>
                        </div>
                        <div className="space-y-3">
                          {ctrl.templateVars.body.map((item, index) => (
                            <div key={`${item.key}-${index}`} className="flex items-center gap-3">
                              <span className="rounded-lg bg-amber-100 dark:bg-amber-500/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-200">
                                {item.placeholder}
                              </span>
                              <div className="relative flex flex-1 items-center">
                                <input
                                  value={item.value}
                                  onChange={(event) => ctrl.setTemplateVarValue('body', index, event.target.value)}
                                  placeholder={`Variável do corpo (${item.placeholder})`}
                                  className={`w-full rounded-xl border bg-[var(--ds-bg-elevated)] px-4 py-2 pr-10 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] ${
                                    !item.value.trim() && item.required
                                      ? 'border-amber-400 dark:border-amber-400/40'
                                      : 'border-[var(--ds-border-default)]'
                                  }`}
                                />
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-secondary)] hover:text-amber-700 dark:text-amber-300"
                                    >
                                      <Braces size={14} />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="min-w-52 border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)]"
                                  >
                                    <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                      Dados do contato
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('body', index, '{{nome}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <Users size={14} className="text-indigo-400" />
                                      <span>Nome</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('body', index, '{{telefone}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <div className="text-green-400 font-mono text-[10px] w-3.5 text-center">Ph</div>
                                      <span>Telefone</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setTemplateVarValue('body', index, '{{email}}')}
                                      className="flex items-center gap-2"
                                    >
                                      <div className="text-blue-400 font-mono text-[10px] w-3.5 text-center">@</div>
                                      <span>E-mail</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                    {ctrl.customFields.length > 0 && (
                                      <>
                                        <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                          Campos personalizados
                                        </DropdownMenuLabel>
                                        {ctrl.customFields.map((field) => (
                                          <DropdownMenuItem
                                            key={field.key}
                                            onSelect={() => ctrl.setTemplateVarValue('body', index, `{{${field.key}}}`)}
                                            className="flex items-center gap-2"
                                          >
                                            <div className="text-amber-600 dark:text-amber-400 font-mono text-[10px] w-3.5 text-center">#</div>
                                            <span>{field.label || field.key}</span>
                                          </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                      </>
                                    )}
                                    <DropdownMenuItem
                                      onSelect={() => ctrl.setIsFieldsSheetOpen(true)}
                                      className="text-xs text-amber-600 dark:text-amber-400"
                                    >
                                      <Plus size={12} /> Gerenciar campos
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {item.required && <span className="text-xs text-amber-700 dark:text-amber-300">obrigatório</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {ctrl.buttonAudit.some((b: any) => b.kind === 'url' && b.isDynamic) && (
                      <div className="space-y-3 border-t border-[var(--ds-border-default)] pt-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-200">URL</span>
                          <span>Variáveis dos botões</span>
                        </div>

                        <div className="space-y-3">
                          {ctrl.buttonAudit
                            .filter((b: any) => b.kind === 'url' && b.isDynamic)
                            .map((b: any) => (
                              <div key={`btn-${b.index}`} className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{b.text}</div>
                                  <div className="text-[10px] uppercase tracking-widest text-[var(--ds-text-muted)]">botão {b.index + 1}</div>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {(b.requiredKeys as string[]).map((k: string) => {
                                    const id = `{{${k}}}`
                                    const value = ctrl.templateButtonVars[`button_${b.index}_${k}`] || ''
                                    return (
                                      <div key={`btn-${b.index}-${k}`} className="flex items-center gap-3">
                                        <span className="rounded-lg bg-amber-100 dark:bg-amber-500/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-200">{id}</span>
                                        <div className="relative flex flex-1 items-center">
                                          <input
                                            value={value}
                                            onChange={(event) => ctrl.setButtonVarValue(b.index, k, event.target.value)}
                                            placeholder={`Variável do botão (${id})`}
                                            className={`w-full rounded-xl border bg-[var(--ds-bg-elevated)] px-4 py-2 pr-10 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] ${
                                              !value.trim() ? 'border-amber-400 dark:border-amber-400/40' : 'border-[var(--ds-border-default)]'
                                            }`}
                                          />
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                type="button"
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-secondary)] hover:text-amber-700 dark:text-amber-300"
                                              >
                                                <Braces size={14} />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align="end"
                                              className="min-w-52 border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)]"
                                            >
                                              <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                                Dados do contato
                                              </DropdownMenuLabel>
                                              <DropdownMenuItem
                                                onSelect={() => ctrl.setButtonVarValue(b.index, k, '{{nome}}')}
                                                className="flex items-center gap-2"
                                              >
                                                <Users size={14} className="text-indigo-400" />
                                                <span>Nome</span>
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onSelect={() => ctrl.setButtonVarValue(b.index, k, '{{telefone}}')}
                                                className="flex items-center gap-2"
                                              >
                                                <div className="text-green-400 font-mono text-[10px] w-3.5 text-center">Ph</div>
                                                <span>Telefone</span>
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onSelect={() => ctrl.setButtonVarValue(b.index, k, '{{email}}')}
                                                className="flex items-center gap-2"
                                              >
                                                <div className="text-blue-400 font-mono text-[10px] w-3.5 text-center">@</div>
                                                <span>E-mail</span>
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                              {ctrl.customFields.length > 0 && (
                                                <>
                                                  <DropdownMenuLabel className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                                                    Campos personalizados
                                                  </DropdownMenuLabel>
                                                  {ctrl.customFields.map((field) => (
                                                    <DropdownMenuItem
                                                      key={field.key}
                                                      onSelect={() => ctrl.setButtonVarValue(b.index, k, `{{${field.key}}}`)}
                                                      className="flex items-center gap-2"
                                                    >
                                                      <div className="text-amber-600 dark:text-amber-400 font-mono text-[10px] w-3.5 text-center">#</div>
                                                      <span>{field.label || field.key}</span>
                                                    </DropdownMenuItem>
                                                  ))}
                                                  <DropdownMenuSeparator className="bg-[var(--ds-bg-hover)]" />
                                                </>
                                              )}
                                              <DropdownMenuItem
                                                onSelect={() => ctrl.setIsFieldsSheetOpen(true)}
                                                className="text-xs text-amber-600 dark:text-amber-400"
                                              >
                                                <Plus size={12} /> Gerenciar campos
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                        <span className="text-xs text-amber-700 dark:text-amber-300">obrigatório</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {ctrl.step === 2 && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                {ctrl.collapseAudienceChoice ? (
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Público</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--ds-text-primary)]">
                        {ctrl.audienceMode === 'todos' && 'Todos'}
                        {ctrl.audienceMode === 'segmentos' && 'Segmentos'}
                        {ctrl.audienceMode === 'teste' && 'Teste'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => ctrl.setCollapseAudienceChoice(false)}
                      className="text-xs text-emerald-700 dark:text-emerald-300"
                    >
                      Editar público
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Escolha o público</h2>
                      <p className="text-sm text-[var(--ds-text-muted)]">Uma decisao rapida antes dos filtros.</p>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                      {[
                        { label: 'Todos', value: 'todos', helper: `${ctrl.statsQuery.data?.optIn ?? 0} contatos elegíveis` },
                        { label: 'Segmentos', value: 'segmentos', helper: 'Filtrar por tags, DDI ou UF' },
                        { label: 'Teste', value: 'teste', helper: 'Enviar para contato de teste' },
                      ].map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => ctrl.setAudienceMode(item.value)}
                          className={`rounded-2xl border px-4 py-4 text-left text-sm ${
                            ctrl.audienceMode === item.value
                              ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-[var(--ds-text-primary)]'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                          }`}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-2 text-xs text-[var(--ds-text-muted)]">{item.helper}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {ctrl.audienceMode === 'todos' && (
                <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Todos os contatos</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">Nenhum filtro aplicado.</p>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold text-[var(--ds-text-primary)]">{ctrl.statsQuery.data?.optIn ?? 0}</p>
                      <p className="text-xs text-[var(--ds-text-muted)]">Elegíveis</p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold text-amber-700 dark:text-amber-200">{ctrl.statsQuery.data?.optOut ?? 0}</p>
                      <p className="text-xs text-[var(--ds-text-muted)]">Suprimidos</p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                      <p className="text-2xl font-semibold text-[var(--ds-text-primary)]">0</p>
                      <p className="text-xs text-[var(--ds-text-muted)]">Duplicados</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-[var(--ds-text-muted)]">
                    Envio para todos os contatos válidos, excluindo opt-out e suprimidos.
                  </p>
                </div>
              )}

              {ctrl.audienceMode === 'segmentos' && (
                <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <Sheet open={ctrl.showStatesPanel} onOpenChange={ctrl.setShowStatesPanel}>
                    <SheetContent className="w-full border-l border-[var(--ds-border-default)] bg-[var(--ds-bg-base)] p-0 sm:max-w-md">
                      <SheetHeader className="border-b border-[var(--ds-border-default)] p-6">
                        <SheetTitle className="text-[var(--ds-text-primary)]">Selecionar UF</SheetTitle>
                        <SheetDescription className="text-[var(--ds-text-secondary)]">
                          Escolha os estados para segmentar.
                        </SheetDescription>
                      </SheetHeader>
                      <div className="space-y-4 p-6">
                        {!ctrl.isBrSelected && (
                          <div className="rounded-lg border border-amber-300 dark:border-amber-400/20 bg-amber-100 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                            Selecione BR no DDI para habilitar as UFs.
                          </div>
                        )}
                        <input
                          className="w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                          placeholder="Buscar UF..."
                          value={ctrl.stateSearch}
                          onChange={(event) => ctrl.setStateSearch(event.target.value)}
                        />
                        <div className="max-h-64 overflow-y-auto pr-1">
                          <div className="flex flex-wrap gap-2">
                            {ctrl.filteredStates.length === 0 && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Nenhuma UF encontrada.</span>
                            )}
                            {ctrl.filteredStates.map((item) => {
                              const active = ctrl.selectedStates.includes(item.code)
                              const disabled = !ctrl.isBrSelected
                              return (
                                <button
                                  key={item.code}
                                  type="button"
                                  disabled={disabled}
                                  aria-disabled={disabled}
                                  onClick={() => {
                                    if (disabled) return
                                    if (ctrl.combineMode === 'and') {
                                      ctrl.setSelectedStates(active ? [] : [item.code])
                                      return
                                    }
                                    ctrl.toggleSelection(item.code, ctrl.selectedStates, ctrl.setSelectedStates)
                                  }}
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    active
                                      ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-100'
                                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                                  } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                                >
                                  <span>{item.code}</span>
                                  <sup className="ml-1 text-[8px] leading-none text-amber-700 dark:text-amber-300">{item.count}</sup>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                  {ctrl.collapseQuickSegments ? (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Segmentos rapidos</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ds-text-primary)]">Resumo aplicado</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => ctrl.setCollapseQuickSegments(false)}
                        className="text-xs text-emerald-700 dark:text-emerald-300"
                      >
                        Editar segmentos
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Segmentos rapidos</h2>
                          <p className="text-sm text-[var(--ds-text-muted)]">Refine sem abrir um construtor completo.</p>
                        </div>
                        <button className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]">Limpar</button>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--ds-text-secondary)]">
                        <span className="uppercase tracking-widest text-[var(--ds-text-muted)]">Combinacao</span>
                        <button
                          type="button"
                          onClick={() => ctrl.setCombineMode('or')}
                          className={`rounded-full border px-3 py-1 ${
                            ctrl.combineMode === 'or'
                              ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                          }`}
                        >
                          Mais alcance
                        </button>
                        <button
                          type="button"
                          onClick={() => ctrl.setCombineMode('and')}
                          className={`rounded-full border px-3 py-1 ${
                            ctrl.combineMode === 'and'
                              ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                          }`}
                        >
                          Mais preciso
                        </button>
                        <span className="text-xs text-[var(--ds-text-muted)]">
                          {ctrl.combineModeLabel}: {ctrl.combinePreview}
                        </span>
                        <span className="text-xs text-[var(--ds-text-muted)]">
                          Estimativa: {ctrl.isSegmentCountLoading ? 'Calculando...' : `${ctrl.audienceCount} contatos`}
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Tags</p>
                            {ctrl.allTags.length > 0 && (
                              <Popover open={tagSearchOpen} onOpenChange={setTagSearchOpen}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-2 py-1 text-xs text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-elevated-hover)]"
                                  >
                                    <Search className="size-3" />
                                    Buscar tag
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="start">
                                  <Command>
                                    <CommandInput placeholder="Buscar tag..." />
                                    <CommandList>
                                      <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
                                      <CommandGroup>
                                        {ctrl.allTags.map((item) => {
                                          const active = ctrl.selectedTags.includes(item.tag)
                                          return (
                                            <CommandItem
                                              key={item.tag}
                                              value={item.tag}
                                              onSelect={() => {
                                                ctrl.toggleSelection(item.tag, ctrl.selectedTags, ctrl.setSelectedTags)
                                                setTagSearchOpen(false)
                                              }}
                                            >
                                              <span className="flex-1">{item.tag}</span>
                                              <span className="text-xs text-[var(--ds-text-muted)]">{item.count}</span>
                                              {active && <Check className="ml-1 size-3 text-emerald-500" />}
                                            </CommandItem>
                                          )
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {ctrl.tagCountsQuery.isLoading && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Carregando tags...</span>
                            )}
                            {!ctrl.tagCountsQuery.isLoading && ctrl.tagChips.length === 0 && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Sem tags cadastradas</span>
                            )}
                            {ctrl.tagChips.map((tag) => {
                              const count = ctrl.tagCounts[tag]
                              const active = ctrl.selectedTags.includes(tag)
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => ctrl.toggleSelection(tag, ctrl.selectedTags, ctrl.setSelectedTags)}
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    active
                                      ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-100'
                                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                                  }`}
                                >
                                  <span>{tag}</span>
                                  {typeof count === 'number' && (
                                    <sup className="ml-1 text-[8px] leading-none text-amber-700 dark:text-amber-300">{count}</sup>
                                  )}
                                </button>
                              )
                            })}
                            {ctrl.selectedTags
                              .filter((tag) => !ctrl.tagChips.includes(tag))
                              .map((tag) => {
                                const count = ctrl.tagCounts[tag]
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => ctrl.toggleSelection(tag, ctrl.selectedTags, ctrl.setSelectedTags)}
                                    className="rounded-full border border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-100"
                                  >
                                    <span>{tag}</span>
                                    {typeof count === 'number' && (
                                      <sup className="ml-1 text-[8px] leading-none text-amber-700 dark:text-amber-300">{count}</sup>
                                    )}
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Pais (DDI)</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {ctrl.countriesQuery.isLoading && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Carregando DDI...</span>
                            )}
                            {!ctrl.countriesQuery.isLoading && ctrl.countryChips.length === 0 && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Sem DDI cadastrados</span>
                            )}
                            {ctrl.countryChips.map((chip) => {
                              const active = ctrl.selectedCountries.includes(chip)
                              const count = ctrl.countryCounts[chip]
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => {
                                    if (ctrl.combineMode === 'and') {
                                      ctrl.setSelectedCountries(active ? [] : [chip])
                                      if (!active && chip !== 'BR') {
                                        ctrl.setSelectedStates([])
                                      }
                                      return
                                    }
                                    ctrl.toggleSelection(chip, ctrl.selectedCountries, ctrl.setSelectedCountries)
                                  }}
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    active
                                      ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-100'
                                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                                  }`}
                                >
                                  <span>{chip}</span>
                                  {typeof count === 'number' && (
                                    <sup className="ml-1 text-[8px] leading-none text-amber-700 dark:text-amber-300">{count}</sup>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">UF (BR)</p>
                          <div className="mt-3 flex items-center gap-2 overflow-hidden">
                            {ctrl.statesQuery.isLoading && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Carregando UFs...</span>
                            )}
                            {!ctrl.statesQuery.isLoading && ctrl.stateChips.length === 0 && (
                              <span className="text-xs text-[var(--ds-text-muted)]">Sem UFs cadastrados</span>
                            )}
                            {ctrl.stateChipsToShow.map((chip) => {
                              const active = ctrl.selectedStates.includes(chip)
                              const disabled = !ctrl.isBrSelected
                              const count = ctrl.stateCounts[chip]
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  disabled={disabled}
                                  aria-disabled={disabled}
                                  onClick={() => {
                                    if (disabled) return
                                    if (ctrl.combineMode === 'and') {
                                      ctrl.setSelectedStates(active ? [] : [chip])
                                      return
                                    }
                                    ctrl.toggleSelection(chip, ctrl.selectedStates, ctrl.setSelectedStates)
                                  }}
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    active
                                      ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-100'
                                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                                  } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                                >
                                  <span>{chip}</span>
                                  {typeof count === 'number' && (
                                    <sup className="ml-1 text-[8px] leading-none text-amber-700 dark:text-amber-300">{count}</sup>
                                  )}
                                </button>
                              )
                            })}
                            {!ctrl.statesQuery.isLoading && ctrl.hiddenStateCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!ctrl.isBrSelected) return
                                  ctrl.setStateSearch('')
                                  ctrl.setShowStatesPanel(true)
                                }}
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  ctrl.isBrSelected
                                    ? 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:border-white/30'
                                    : 'cursor-not-allowed border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]'
                                }`}
                              >
                                +{ctrl.hiddenStateCount}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {ctrl.audienceMode === 'teste' && (
                <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Contato de teste</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">Escolha o contato configurado, outro contato, ou ambos.</p>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Telefone de teste (settings)</label>
                        <a href="/settings#test-contact" className="text-xs text-emerald-700 dark:text-emerald-300">
                          Editar em configuracoes
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!ctrl.hasConfiguredContact) return
                          ctrl.setSendToConfigured((prev) => !prev)
                        }}
                        className={`mt-3 w-full rounded-xl border bg-[var(--ds-bg-elevated)] px-4 py-3 text-left text-sm ${
                          ctrl.sendToConfigured && ctrl.hasConfiguredContact
                            ? 'border-emerald-600 dark:border-emerald-400/40 text-[var(--ds-text-primary)]'
                            : 'border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
                        } ${!ctrl.hasConfiguredContact ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {ctrl.configuredLabel}
                      </button>
                      {ctrl.hasConfiguredContact ? (
                        <p className="mt-2 text-xs text-[var(--ds-text-muted)]">Clique para incluir/remover no envio.</p>
                      ) : (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Nenhum telefone de teste configurado.</p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                      <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Usar outro contato</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                        placeholder="Nome, telefone ou e-mail..."
                        value={ctrl.testContactSearch}
                        onChange={(event) => ctrl.setTestContactSearch(event.target.value)}
                      />
                      {ctrl.testContactSearch.trim().length < 2 && !ctrl.selectedTestContact && (
                        <p className="mt-2 text-xs text-[var(--ds-text-muted)]">Digite pelo menos 2 caracteres para buscar.</p>
                      )}
                      {ctrl.contactSearchQuery.isLoading && (
                        <p className="mt-2 text-xs text-[var(--ds-text-muted)]">Buscando contatos...</p>
                      )}
                      {ctrl.contactSearchQuery.isError && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Erro ao buscar contatos.</p>
                      )}
                      <div className="mt-3 space-y-2 text-sm text-[var(--ds-text-secondary)]">
                        {ctrl.displayTestContacts.map((contact) => {
                          const isSelected = ctrl.selectedTestContact?.id === contact.id
                          const isActive = isSelected && ctrl.sendToSelected
                          return (
                            <button
                              key={contact.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  ctrl.setSendToSelected((prev) => !prev)
                                } else {
                                  ctrl.setSelectedTestContact(contact)
                                  ctrl.setSendToSelected(true)
                                }
                              }}
                              className={`w-full rounded-xl border bg-[var(--ds-bg-elevated)] px-3 py-2 text-left transition ${
                                isActive
                                  ? 'border-emerald-600 dark:border-emerald-400/40 text-[var(--ds-text-primary)]'
                                  : isSelected
                                    ? 'border-[var(--ds-border-default)] text-[var(--ds-text-secondary)]'
                                    : 'border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:border-emerald-600 dark:hover:border-emerald-400/40'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-[var(--ds-text-primary)]">{contact.name || 'Contato'}</span>
                                <span className="text-xs text-[var(--ds-text-muted)]">{contact.phone}</span>
                              </div>
                              {contact.email && <div className="mt-1 text-xs text-[var(--ds-text-muted)]">{contact.email}</div>}
                            </button>
                          )
                        })}
                        {!ctrl.displayTestContacts.length &&
                          ctrl.testContactSearch.trim().length >= 2 &&
                          !ctrl.contactSearchQuery.isLoading && (
                            <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-xs text-[var(--ds-text-muted)]">
                              Nenhum contato encontrado.
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      Envio de teste não consome limite diário. Selecione 1 ou 2 contatos.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {ctrl.step === 3 && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Validação de destinatários</h2>
                  <p className="text-sm text-[var(--ds-text-muted)]">Validação automática antes do disparo.</p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                    <p className="text-2xl font-semibold text-[var(--ds-text-primary)]">
                      {ctrl.isPrecheckLoading ? '—' : ctrl.precheckTotals?.valid ?? '—'}
                    </p>
                    <p className="text-xs text-[var(--ds-text-muted)]">Válidos</p>
                  </div>
                  <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                    <p className="text-2xl font-semibold text-amber-700 dark:text-amber-300">
                      {ctrl.isPrecheckLoading ? '—' : ctrl.precheckTotals?.skipped ?? '—'}
                    </p>
                    <p className="text-xs text-[var(--ds-text-muted)]">Ignorados</p>
                  </div>
                  <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 text-center">
                    <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                      {ctrl.precheckError
                        ? 'Falhou'
                        : ctrl.isPrecheckLoading
                          ? '...'
                          : ctrl.precheckTotals && ctrl.precheckTotals.skipped > 0
                            ? 'Atencao'
                            : 'OK'}
                    </p>
                    <p className="text-xs text-[var(--ds-text-muted)]">Status</p>
                  </div>
                </div>
                {ctrl.precheckError && (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{ctrl.precheckError}</p>
                )}

                {ctrl.precheckTotals && ctrl.precheckTotals.skipped > 0 && (
                  <div className="mt-5 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--ds-text-primary)]">Corrigir ignorados</p>
                        <p className="text-xs text-[var(--ds-text-muted)]">
                          Alguns contatos estão sendo ignorados por falta de Nome, E-mail ou campo personalizado. Corrija e a validação destrava.
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2 sm:flex-nowrap">
                        <button
                          type="button"
                          disabled={!ctrl.bulkKeys.length}
                          onClick={() => {
                            ctrl.setBulkError(null)
                            ctrl.setBulkOpen(true)
                          }}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            ctrl.bulkKeys.length
                              ? 'border-amber-400 dark:border-amber-500/20 bg-[var(--ds-bg-elevated)] text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-500/15 hover:border-amber-500 dark:hover:border-amber-500/40'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]'
                          }`}
                        >
                          <Layers size={16} className={ctrl.bulkKeys.length ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--ds-text-muted)]'} />
                          <span className="whitespace-nowrap">Aplicar em massa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => ctrl.runPrecheck()}
                          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-primary-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                        >
                          <RefreshCw size={16} />
                          <span className="whitespace-nowrap">Validar novamente</span>
                        </button>
                        <button
                          type="button"
                          disabled={!ctrl.fixCandidates.length}
                          onClick={ctrl.startBatchFix}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            ctrl.fixCandidates.length
                              ? 'border-primary-500/40 bg-primary-600 text-[var(--ds-text-primary)] hover:bg-primary-500'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]'
                          }`}
                        >
                          <Wand2 size={16} className={ctrl.fixCandidates.length ? 'text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-muted)]'} />
                          <span className="whitespace-nowrap">Corrigir em lote</span>
                        </button>
                      </div>
                    </div>

                    {ctrl.bulkOpen && (
                      <div className="mt-4 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-[var(--ds-text-primary)]">Aplicar campo personalizado em massa</p>
                            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                              Preenche o campo selecionado para todos os contatos ignorados que estão faltando esse dado.
                            </p>
                            {(ctrl.systemMissingCounts.name > 0 || ctrl.systemMissingCounts.email > 0) && (
                              <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
                                Obs: {ctrl.systemMissingCounts.name > 0 ? `${ctrl.systemMissingCounts.name} faltam Nome` : null}
                                {ctrl.systemMissingCounts.name > 0 && ctrl.systemMissingCounts.email > 0 ? ' e ' : null}
                                {ctrl.systemMissingCounts.email > 0 ? `${ctrl.systemMissingCounts.email} faltam E-mail` : null}
                                {' — isso não é preenchido aqui; use "Corrigir em lote".'}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (ctrl.bulkLoading) return
                              ctrl.setBulkOpen(false)
                              ctrl.setBulkError(null)
                            }}
                            className={`text-sm ${ctrl.bulkLoading ? 'text-[var(--ds-text-muted)]' : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'}`}
                          >
                            Fechar
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Campo</label>
                            <select
                              className="w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm text-[var(--ds-text-primary)]"
                              value={ctrl.bulkKey}
                              onChange={(e) => ctrl.setBulkKey(e.target.value)}
                              disabled={ctrl.bulkLoading}
                            >
                              {ctrl.bulkKeys.map((k) => (
                                <option key={k} value={k}>
                                  {(ctrl.customFieldLabelByKey[k] || k) + ` (${ctrl.bulkCustomFieldTargets[k]?.length ?? 0})`}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Valor</label>
                            <input
                              className="w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)]"
                              placeholder="Ex.: teste"
                              value={ctrl.bulkValue}
                              onChange={(e) => ctrl.setBulkValue(e.target.value)}
                              disabled={ctrl.bulkLoading}
                            />
                            <p className="text-xs text-[var(--ds-text-muted)]">
                              Afetados: <span className="text-[var(--ds-text-secondary)]">{ctrl.bulkKey ? (ctrl.bulkCustomFieldTargets[ctrl.bulkKey]?.length ?? 0) : 0}</span>
                            </p>
                            <p className="text-[11px] text-[var(--ds-text-muted)]">
                              Dica: "Aplicar em massa" só resolve campos personalizados. Se algum ignorado pedir Nome/E-mail, ele aparece no "Corrigir em lote".
                            </p>
                          </div>
                        </div>

                        {ctrl.bulkError && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{ctrl.bulkError}</p>}

                        <div className="mt-4 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (ctrl.bulkLoading) return
                              ctrl.setBulkOpen(false)
                              ctrl.setBulkError(null)
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--ds-text-primary)] transition-colors hover:border-[var(--ds-border-default)]"
                            disabled={ctrl.bulkLoading}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={ctrl.applyBulkCustomField}
                            disabled={ctrl.bulkLoading}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                              !ctrl.bulkLoading
                                ? 'border-amber-400 dark:border-amber-500/30 bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-500/15 hover:border-amber-500 dark:hover:border-amber-500/50'
                                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-muted)]'
                            }`}
                          >
                            {ctrl.bulkLoading ? 'Aplicando...' : 'Aplicar agora'}
                          </button>
                        </div>
                      </div>
                    )}

                    {ctrl.fixCandidates.length > 0 && (
                      <div className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-2">
                        {ctrl.fixCandidates.map((c) => (
                          <div
                            key={c.contactId}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--ds-text-primary)]">{c.subtitle}</p>
                              <p className="truncate text-xs text-[var(--ds-text-muted)]">{c.title}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => ctrl.openQuickEdit({ contactId: c.contactId, focus: c.focus, title: c.title })}
                              className="shrink-0 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-text-primary)] transition-colors hover:border-[var(--ds-border-default)]"
                            >
                              Corrigir
                            </button>
                          </div>
                        ))}

                        {ctrl.fixCandidates.length > 3 && (
                          <p className="pt-1 text-xs text-[var(--ds-text-muted)]">Role para ver todos ou use "Corrigir em lote".</p>
                        )}
                      </div>
                    )}

                    {/* Checkbox para prosseguir apenas com válidos */}
                    <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-3 transition-colors hover:bg-[var(--ds-bg-hover)]">
                      <input
                        type="checkbox"
                        checked={ctrl.skipIgnored}
                        onChange={(e) => ctrl.setSkipIgnored(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-[var(--ds-text-secondary)]">
                        Prosseguir apenas com os <strong className="text-[var(--ds-text-primary)]">{ctrl.precheckTotals?.valid ?? 0}</strong> contatos válidos
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {ctrl.step === 4 && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Agendamento</h2>
                  <p className="text-sm text-[var(--ds-text-muted)]">Defina se o envio será agora ou programado.</p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => ctrl.setScheduleMode('imediato')}
                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                      ctrl.scheduleMode === 'imediato'
                        ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                        : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                    }`}
                  >
                    Imediato
                  </button>
                  <button
                    type="button"
                    onClick={() => ctrl.setScheduleMode('agendar')}
                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                      ctrl.scheduleMode === 'agendar'
                        ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                        : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)]'
                    }`}
                  >
                    Agendar
                  </button>
                </div>
                <div className={`mt-4 transition ${ctrl.scheduleMode === 'agendar' ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Data</label>
                      <Dialog.Root open={ctrl.isDatePickerOpen} onOpenChange={ctrl.setIsDatePickerOpen}>
                        <Dialog.Trigger asChild>
                          <button
                            type="button"
                            disabled={ctrl.scheduleMode !== 'agendar'}
                            className="w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] px-4 py-3 text-sm text-[var(--ds-text-primary)] flex items-center justify-between gap-3 disabled:opacity-50"
                          >
                            <span className={ctrl.scheduleDate ? 'text-[var(--ds-text-primary)]' : 'text-[var(--ds-text-muted)]'}>{formatDateLabel(ctrl.scheduleDate)}</span>
                            <CalendarIcon size={16} className="text-emerald-400" />
                          </button>
                        </Dialog.Trigger>
                        <Dialog.Portal>
                          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
                          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-fit max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-emerald-500/20 bg-[var(--ds-bg-base)] p-3 text-[var(--ds-text-primary)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                            <div className="flex justify-center">
                              <Calendar
                                mode="single"
                                selected={parsePickerDate(ctrl.scheduleDate)}
                                onSelect={(date) => {
                                  if (!date) return
                                  ctrl.setScheduleDate(date.toLocaleDateString('en-CA'))
                                  ctrl.setIsDatePickerOpen(false)
                                }}
                                fromDate={new Date()}
                                locale={ptBR}
                                className="w-fit rounded-xl border border-emerald-500/10 bg-[var(--ds-bg-base)] p-2"
                              />
                            </div>

                            <div className="mt-3 w-full">
                              <button
                                type="button"
                                onClick={() => ctrl.setIsDatePickerOpen(false)}
                                className="h-11 w-full rounded-xl bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors"
                              >
                                Confirmar
                              </button>
                            </div>
                          </Dialog.Content>
                        </Dialog.Portal>
                      </Dialog.Root>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Horário</label>
                      <DateTimePicker value={ctrl.scheduleTime} onChange={(value) => ctrl.setScheduleTime(value)} disabled={ctrl.scheduleMode !== 'agendar'} />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-[var(--ds-text-muted)]">Fuso do navegador: {ctrl.userTimeZone || 'Local'}.</p>
                </div>
              </div>

              {/* Organização - Seleção de Pasta */}
              {ctrl.folders.length > 0 && (
                <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">Organização</h2>
                    <p className="text-sm text-[var(--ds-text-muted)]">Salve em uma pasta para organizar suas campanhas (opcional).</p>
                  </div>
                  <div className="mt-4">
                    <label className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Pasta</label>
                    <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                      {/* Opção "Nenhuma" */}
                      <button
                        type="button"
                        onClick={() => ctrl.setSelectedFolderId(null)}
                        className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition ${
                          ctrl.selectedFolderId === null
                            ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                            : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-default)]'
                        }`}
                      >
                        <FolderIcon size={16} className="text-[var(--ds-text-muted)]" />
                        <span>Nenhuma</span>
                      </button>
                      {/* Pastas disponíveis */}
                      {ctrl.folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => ctrl.setSelectedFolderId(folder.id)}
                          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition ${
                            ctrl.selectedFolderId === folder.id
                              ? 'border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-default)]'
                          }`}
                        >
                          <FolderIcon size={16} style={{ color: folder.color }} />
                          <span className="truncate">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <ContactQuickEditModal
            isOpen={Boolean(ctrl.quickEditContactId)}
            contactId={ctrl.quickEditContactId}
            onClose={ctrl.handleQuickEditClose}
            onSaved={ctrl.handleQuickEditSaved}
            focus={ctrl.quickEditFocus}
            title={ctrl.quickEditTitle}
            mode="focused"
            showNameInFocusedMode={false}
          />

          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                onClick={() => {
                  if (ctrl.isLaunching) return
                  // Passo 1 tem "sub-etapas": escolher template -> preencher variáveis
                  if (ctrl.step === 1) {
                    if (ctrl.templateSelected) {
                      // Volta para a seleção de template
                      ctrl.setTemplateSelected(false)
                      ctrl.setPreviewTemplate(null)
                      return
                    }
                    if (ctrl.showAllTemplates) {
                      // Se estiver na lista completa, volta para a lista de recentes
                      ctrl.setShowAllTemplates(false)
                      return
                    }

                    // No primeiro passo (seleção), Voltar leva ao Dashboard
                    ctrl.router.push('/')
                    return
                  }

                  // Demais passos: volta para o passo anterior
                  ctrl.setStep(ctrl.step - 1)
                }}
                className={`text-sm transition ${
                  ctrl.isLaunching ? 'cursor-not-allowed text-[var(--ds-text-muted)]' : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
                }`}
              >
                Voltar
              </button>
              <div className="text-center text-sm text-[var(--ds-text-secondary)]">
                {ctrl.step === 1 && !ctrl.templateSelected && 'Selecione um template para continuar'}
                {ctrl.step === 1 && ctrl.templateSelected && ctrl.missingTemplateVars > 0 && (
                  <>Preencha {ctrl.missingTemplateVars} variável(is) obrigatória(s)</>
                )}
                {ctrl.step === 1 && ctrl.templateSelected && ctrl.missingTemplateVars === 0 && !ctrl.campaignName.trim() && (
                  <>Defina o nome da campanha</>
                )}
                {ctrl.step === 2 && !ctrl.isAudienceComplete && 'Selecione um público válido'}
                {ctrl.step === 3 && ctrl.isPrecheckLoading && 'Validando destinatários...'}
                {ctrl.step === 3 && !ctrl.isPrecheckLoading && ctrl.precheckNeedsFix && !ctrl.skipIgnored && 'Corrija os ignorados ou marque para prosseguir apenas com válidos'}
                {ctrl.step === 3 && !ctrl.isPrecheckLoading && ctrl.precheckTotals && (ctrl.precheckTotals.valid ?? 0) === 0 && 'Nenhum destinatário válido — corrija os ignorados'}
                {ctrl.step === 4 && !ctrl.isScheduleComplete && 'Defina data e horário do agendamento'}
                {ctrl.canContinue && ctrl.footerSummary}
              </div>
              <div className="flex items-center gap-3">
                {/* Botão Salvar Rascunho (só no step 4) */}
                {ctrl.step === 4 && (
                  <button
                    onClick={ctrl.handleSaveDraft}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                      ctrl.canContinue && !ctrl.isLaunching && !ctrl.isSavingDraft
                        ? 'border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]'
                        : 'cursor-not-allowed border border-[var(--ds-border-default)] text-[var(--ds-text-muted)]'
                    }`}
                    disabled={!ctrl.canContinue || ctrl.isLaunching || ctrl.isSavingDraft}
                  >
                    <Save size={16} />
                    {ctrl.isSavingDraft ? 'Salvando...' : 'Salvar Rascunho'}
                  </button>
                )}

                {/* Botão Continuar / Lançar */}
                <button
                  onClick={async () => {
                    if (!ctrl.canContinue || ctrl.isLaunching || ctrl.isSavingDraft) return
                    if (ctrl.step === 1) {
                      ctrl.setStep(2)
                      return
                    }
                    if (ctrl.step === 2) {
                      const result = await ctrl.runPrecheck()
                      const totals = result?.totals
                      const skipped = totals?.skipped ?? 0
                      const valid = totals?.valid ?? 0
                      if (!result || skipped > 0 || valid === 0) {
                        ctrl.setStep(3)
                        return
                      }
                      ctrl.setStep(4)
                      return
                    }
                    if (ctrl.step === 3) {
                      if (!ctrl.isPrecheckOk) return
                      ctrl.setStep(4)
                      return
                    }
                    ctrl.handleLaunch()
                  }}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    ctrl.canContinue && !ctrl.isLaunching && !ctrl.isSavingDraft
                      ? 'bg-primary-600 text-white dark:bg-white dark:text-black'
                      : 'cursor-not-allowed border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-muted)]'
                  }`}
                  disabled={!ctrl.canContinue || ctrl.isLaunching || ctrl.isSavingDraft}
                >
                  {ctrl.step < 4 ? 'Continuar' : ctrl.isLaunching ? 'Lancando...' : 'Lancar campanha'}
                </button>
              </div>
            </div>
            {ctrl.launchError && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{ctrl.launchError}</p>
            )}
          </div>
        </div>

        <div className={`flex h-full flex-col gap-4 ${ctrl.step === 2 ? 'lg:sticky lg:top-6' : ''}`}>
          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Resumo</div>
              <button className="rounded-full border border-emerald-600 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                Campanha Rapida
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {/* Contatos e Custo só aparecem a partir do Step 2 (quando faz sentido) */}
              {ctrl.step >= 2 && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ds-text-muted)]">Contatos</span>
                    <span className="text-[var(--ds-text-primary)]">{ctrl.displayAudienceCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ds-text-muted)]">Custo</span>
                    <span className="text-emerald-700 dark:text-emerald-300">{ctrl.displayAudienceCost}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-text-muted)]">Custo Base</span>
                <div className="text-right">
                  <div className="text-emerald-700 dark:text-emerald-300">{ctrl.basePricePerMessage}/msg</div>
                  <div className="text-[10px] text-[var(--ds-text-muted)]">
                    {ctrl.selectedTemplate?.category || '—'} • {ctrl.exchangeRateLabel}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-text-muted)]">Agendamento</span>
                <span className="text-[var(--ds-text-primary)]">{ctrl.scheduleSummaryLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-text-muted)]">Nome</span>
                <span className="text-[var(--ds-text-primary)]">{ctrl.campaignName.trim() || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-text-muted)]">Template</span>
                <span className="text-[var(--ds-text-primary)]">{ctrl.templateSelected ? ctrl.selectedTemplate?.name || '—' : '—'}</span>
              </div>
              {/* Público só aparece a partir do Step 2 */}
              {ctrl.step >= 2 && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-text-muted)]">Público</span>
                  <span className="text-[var(--ds-text-primary)]">
                    {ctrl.audienceMode === 'teste'
                      ? `${ctrl.selectedTestCount || 0} contato(s) de teste`
                      : ctrl.isSegmentCountLoading
                        ? 'Calculando...'
                        : `${ctrl.effectiveAudienceCount} contatos`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-8 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">Preview</div>
              <button className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]">Expandir</button>
            </div>
            <div className="mt-6 text-sm text-[var(--ds-text-secondary)]">
              {ctrl.activeTemplate ? (
                <>
                  <div>
                    <TemplatePreviewCard
                      templateName={ctrl.activeTemplate.name}
                      components={ctrl.templateComponents}
                      parameterFormat={ctrl.parameterFormat}
                      variables={Array.isArray(ctrl.resolvedBody) ? ctrl.resolvedBody : undefined}
                      headerVariables={Array.isArray(ctrl.resolvedHeader) ? ctrl.resolvedHeader : undefined}
                      namedVariables={!Array.isArray(ctrl.resolvedBody) && ctrl.resolvedBody ? (ctrl.resolvedBody as Record<string, string>) : undefined}
                      namedHeaderVariables={!Array.isArray(ctrl.resolvedHeader) && ctrl.resolvedHeader ? (ctrl.resolvedHeader as Record<string, string>) : undefined}
                      headerMediaPreviewUrl={ctrl.activeTemplate.headerMediaPreviewUrl || ctrl.headerExampleUrl || null}
                      fallbackContent={ctrl.activeTemplate.content || ctrl.activeTemplate.preview}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-[var(--ds-text-primary)]">Selecione um template</p>
                  <p className="mt-3 text-sm text-[var(--ds-text-muted)]">O preview aparece aqui quando você escolher.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <CustomFieldsSheet
        open={ctrl.isFieldsSheetOpen}
        onOpenChange={ctrl.setIsFieldsSheetOpen}
        entityType="contact"
      />
    </div>
  )
}
