'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { Template } from '@/types'
import { buildTemplateSpecV1, resolveVarValue } from '@/lib/whatsapp/template-contract'
import { replaceTemplatePlaceholders } from '@/lib/whatsapp/placeholder'
import { campaignService } from '@/services/campaignService'
import type { CampaignPrecheckResult } from '@/services/campaignService'
import { getBrazilUfFromPhone } from '@/lib/br-geo'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { parsePhoneNumber } from 'libphonenumber-js'
import { humanizePrecheckReason, humanizeVarSource, type ContactFixFocus, type ContactFixTarget } from '@/lib/precheck-humanizer'
import { getPricingBreakdown } from '@/lib/whatsapp-pricing'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { useCampaignFolders } from '@/hooks/useCampaignFolders'

// ── Types ──────────────────────────────────────────────────────────────

export type Contact = {
  id: string
  name: string
  phone: string
  email?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
}

export type CustomField = {
  key: string
  label: string
  type: string
}

type ContactStats = {
  total: number
  optIn: number
  optOut: number
}

type CountryCount = {
  code: string
  count: number
}

type StateCount = {
  code: string
  count: number
}

type TestContact = {
  name?: string
  phone?: string
}

export type TemplateVar = {
  key: string
  placeholder: string
  value: string
  required: boolean
}

// ── Constants ──────────────────────────────────────────────────────────

export const steps = [
  { id: 1, label: 'Configuração' },
  { id: 2, label: 'Público' },
  { id: 3, label: 'Validação' },
  { id: 4, label: 'Agendamento' },
]

// ── Pure utility functions ─────────────────────────────────────────────

export const getDefaultScheduleTime = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 60)
  const minutes = d.getMinutes()
  if (minutes <= 30) {
    d.setMinutes(30, 0, 0)
  } else {
    d.setHours(d.getHours() + 1)
    d.setMinutes(0, 0, 0)
  }
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export const formatDateLabel = (value: string) => {
  if (!value) return 'dd/mm/aaaa'
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return 'dd/mm/aaaa'
  return `${d}/${m}/${y}`
}

export const parsePickerDate = (value: string) => {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map((v) => Number(v))
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0)
}

const buildScheduledAt = (date: string, time: string) => {
  if (!date || !time) return undefined
  const [year, month, day] = date.split('-').map((v) => Number(v))
  const [hour, minute] = time.split(':').map((v) => Number(v))
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return undefined
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

/**
 * Extrai informações do Flow de um template, se houver um botão do tipo FLOW
 */
const extractFlowFromTemplate = (template: Template | null): { flowId: string | null; flowName: string | null } => {
  if (!template?.components) return { flowId: null, flowName: null }

  for (const component of template.components) {
    if (component.type === 'BUTTONS' && component.buttons) {
      for (const button of component.buttons) {
        if (button.type === 'FLOW' && button.flow_id) {
          return {
            flowId: button.flow_id,
            flowName: button.text || null, // Nome do botão como fallback
          }
        }
      }
    }
  }

  return { flowId: null, flowName: null }
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Erro ao buscar dados')
  }
  return res.json()
}

// ── Controller Hook ────────────────────────────────────────────────────

export const useCampaignNewController = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedTemplateName = searchParams?.get('templateName') || null
  const [step, setStep] = useState(1)
  const [audienceMode, setAudienceMode] = useState('todos')
  const [combineMode, setCombineMode] = useState('or')
  const [collapseAudienceChoice, setCollapseAudienceChoice] = useState(false)
  const [collapseQuickSegments, setCollapseQuickSegments] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [testContactSearch, setTestContactSearch] = useState('')
  const [selectedTestContact, setSelectedTestContact] = useState<Contact | null>(null)
  const [configuredContact, setConfiguredContact] = useState<Contact | null>(null)
  const [sendToConfigured, setSendToConfigured] = useState(true)
  const [sendToSelected, setSendToSelected] = useState(false)
  const [templateSelected, setTemplateSelected] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [showAllTemplates, setShowAllTemplates] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Todos')
  const [scheduleMode, setScheduleMode] = useState('imediato')
  const [isFieldsSheetOpen, setIsFieldsSheetOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [scheduleTime, setScheduleTime] = useState(() => getDefaultScheduleTime())
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const userTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [templateVars, setTemplateVars] = useState<{ header: TemplateVar[]; body: TemplateVar[] }>({
    header: [],
    body: [],
  })
  const [templateButtonVars, setTemplateButtonVars] = useState<Record<string, string>>({})
  const [templateSpecError, setTemplateSpecError] = useState<string | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [isPrecheckLoading, setIsPrecheckLoading] = useState(false)
  const [skipIgnored, setSkipIgnored] = useState(false)
  const [precheckError, setPrecheckError] = useState<string | null>(null)
  const [precheckTotals, setPrecheckTotals] = useState<{ valid: number; skipped: number } | null>(null)
  const [precheckResult, setPrecheckResult] = useState<CampaignPrecheckResult | null>(null)

  // Aplicar em massa (bulk) um campo personalizado para desbloquear ignorados.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkKey, setBulkKey] = useState<string>('')
  const [bulkValue, setBulkValue] = useState<string>('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  // Correção (igual ao /new): abrir modal focado para corrigir contatos ignorados.
  const [quickEditContactId, setQuickEditContactId] = useState<string | null>(null)
  const [quickEditFocus, setQuickEditFocus] = useState<ContactFixFocus>(null)
  const [quickEditTitle, setQuickEditTitle] = useState<string>('Editar contato')
  const [batchFixQueue, setBatchFixQueue] = useState<Array<{ contactId: string; focus: ContactFixFocus; title: string }>>([])
  const [batchFixIndex, setBatchFixIndex] = useState(0)
  const batchCloseReasonRef = useRef<'advance' | 'finish' | null>(null)
  const batchNextRef = useRef<{ contactId: string; focus: ContactFixFocus; title: string } | null>(null)
  const [campaignName, setCampaignName] = useState(() => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const month = months[now.getMonth()] || 'mes'
    return `Campanha ${day} de ${month}.`
  })
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({})
  const [showStatesPanel, setShowStatesPanel] = useState(false)
  const [stateSearch, setStateSearch] = useState('')
  const { rate: exchangeRate, hasRate } = useExchangeRate()
  const { folders, isLoading: isFoldersLoading } = useCampaignFolders()

  useEffect(() => {
    if (combineMode !== 'and') return
    setSelectedCountries((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev))
    setSelectedStates((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev))
  }, [combineMode])

  useEffect(() => {
    if (!selectedStates.length) return
    if (selectedCountries.includes('BR')) return
    setSelectedStates([])
  }, [selectedCountries, selectedStates])

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const local = await fetchJson<Template[]>('/api/templates?source=local').catch(() => [])
      if (Array.isArray(local) && local.length) return local
      return fetchJson<Template[]>('/api/templates')
    },
    staleTime: 30_000,
  })

  const customFieldsQuery = useQuery({
    queryKey: ['custom-fields', 'contact'],
    queryFn: () => fetchJson<CustomField[]>('/api/custom-fields?entityType=contact'),
    staleTime: 60_000,
  })

  const customFieldLabelByKey = useMemo(() => {
    const fields = customFieldsQuery.data || []
    return Object.fromEntries(fields.map((f) => [f.key, f.label])) as Record<string, string>
  }, [customFieldsQuery.data])

  // Queries de audiência - só carregam a partir do Step 2 (Público)
  const tagsQuery = useQuery({
    queryKey: ['contact-tags'],
    queryFn: () => fetchJson<string[]>('/api/contacts/tags'),
    staleTime: 60_000,
    enabled: step >= 2,
  })

  const statsQuery = useQuery({
    queryKey: ['contact-stats'],
    queryFn: () => fetchJson<ContactStats>('/api/contacts/stats'),
    staleTime: 30_000,
    enabled: step >= 2,
  })

  const countriesQuery = useQuery({
    queryKey: ['contact-country-codes'],
    queryFn: () => fetchJson<{ data: CountryCount[] }>('/api/contacts/country-codes'),
    staleTime: 60_000,
    enabled: step >= 2,
  })

  const statesQuery = useQuery({
    queryKey: ['contact-state-codes'],
    queryFn: () => fetchJson<{ data: StateCount[] }>('/api/contacts/state-codes'),
    staleTime: 60_000,
    enabled: step >= 2,
  })

  const testContactQuery = useQuery({
    queryKey: ['test-contact'],
    queryFn: () => fetchJson<TestContact | null>('/api/settings/test-contact'),
    staleTime: 30_000,
  })

  const contactSearchQuery = useQuery({
    queryKey: ['contacts-search', testContactSearch],
    queryFn: async () => {
      // Importante: o backend ordena por created_at desc.
      // Usamos um limit maior e ordenamos no client (A-Z) para evitar que contatos antigos
      // (ex.: "Thais") fiquem de fora quando há muitos matches.
      const res = await fetchJson<{ data: Contact[] }>('/api/contacts?limit=25&search=' + encodeURIComponent(testContactSearch))
      return res.data || []
    },
    enabled: testContactSearch.trim().length >= 2,
    staleTime: 10_000,
  })

  const segmentCountQuery = useQuery({
    queryKey: ['segment-count', combineMode, selectedTags, selectedCountries, selectedStates],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('combine', combineMode)
      if (selectedTags.length) params.set('tags', selectedTags.join(','))
      if (selectedCountries.length) params.set('countries', selectedCountries.join(','))
      if (selectedStates.length) params.set('states', selectedStates.join(','))
      return fetchJson<{ total: number; matched: number }>(`/api/contacts/segment-count?${params.toString()}`)
    },
    enabled: audienceMode === 'segmentos',
    staleTime: 10_000,
  })

  const contactSearchResults = contactSearchQuery.data || []

  const sortedContactSearchResults = useMemo(() => {
    const normalizeForSearch = (value: string) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')

    const query = normalizeForSearch(testContactSearch)

    const getKey = (c: Contact) => {
      const name = String(c?.name || '').trim()
      const email = String(c?.email || '').trim()
      const phone = String(c?.phone || '').trim()
      // Prioriza nome; se não existir, usa email; depois telefone.
      return (name || email || phone || '').toLowerCase()
    }

    const getMatchRank = (c: Contact) => {
      if (!query) return 1

      const name = normalizeForSearch(String(c?.name || ''))
      const email = normalizeForSearch(String(c?.email || ''))
      const phone = normalizeForSearch(String(c?.phone || ''))

      const nameTokens = name.split(/[^a-z0-9]+/g).filter(Boolean)
      const emailTokens = email.split(/[^a-z0-9]+/g).filter(Boolean)
      const phoneTokens = phone.split(/[^a-z0-9]+/g).filter(Boolean)
      const tokens = [...nameTokens, ...emailTokens, ...phoneTokens]

      // 0 = começa com (melhor)
      if (tokens.some((t) => t.startsWith(query))) return 0
      // 1 = contém
      if (name.includes(query) || email.includes(query) || phone.includes(query)) return 1
      // 2 = não deveria acontecer (pois o backend já filtra), mas mantemos por segurança
      return 2
    }

    return [...contactSearchResults].sort((a, b) => {
      const ra = getMatchRank(a)
      const rb = getMatchRank(b)
      if (ra !== rb) return ra - rb

      const ka = getKey(a)
      const kb = getKey(b)
      const byName = ka.localeCompare(kb, 'pt-BR', { sensitivity: 'base' })
      if (byName !== 0) return byName
      // Garantir estabilidade quando chaves são iguais
      return String(a.id).localeCompare(String(b.id), 'pt-BR')
    })
  }, [contactSearchResults, testContactSearch])

  const displayTestContacts = useMemo(() => {
    if (!selectedTestContact) return sortedContactSearchResults
    const others = sortedContactSearchResults.filter((contact) => contact.id !== selectedTestContact.id)
    return [selectedTestContact, ...others]
  }, [sortedContactSearchResults, selectedTestContact])

  const configuredName = testContactQuery.data?.name?.trim() || configuredContact?.name || ''
  const configuredPhone = testContactQuery.data?.phone?.trim() || configuredContact?.phone || ''
  const hasTestPhoneInSettings = Boolean(testContactQuery.data?.phone?.trim())
  const hasConfiguredContact = Boolean(configuredContact?.phone) || hasTestPhoneInSettings
  const configuredLabel = configuredPhone
    ? [configuredName || 'Contato de teste', configuredPhone].filter(Boolean).join(' - ')
    : 'Defina um telefone de teste'

  const allTemplates = templatesQuery.data || []
  const approvedTemplates = allTemplates.filter(
    (template) => String(template.status || '').toUpperCase() === 'APPROVED'
  )
  const templateOptions = useMemo(() => {
    if (categoryFilter === 'Todos') return approvedTemplates
    // Categorias já vêm canonizadas em português: UTILIDADE, MARKETING, AUTENTICACAO
    const categoryMap: Record<string, string> = {
      'Utilidade': 'UTILIDADE',
      'Marketing': 'MARKETING',
      'Autenticacao': 'AUTENTICACAO',
    }
    const targetCategory = categoryMap[categoryFilter] || categoryFilter.toUpperCase()
    return approvedTemplates.filter(
      (template) => String(template.category || '').toUpperCase() === targetCategory
    )
  }, [approvedTemplates, categoryFilter])
  const customFields = customFieldsQuery.data || []
  const customFieldKeys = customFields.map((field) => field.key)
  const recentTemplates = useMemo(() => templateOptions.slice(0, 3), [templateOptions])
  const recommendedTemplates = useMemo(() => templateOptions.slice(3, 6), [templateOptions])
  const filteredTemplates = useMemo(() => {
    const term = templateSearch.trim().toLowerCase()
    if (!term) return templateOptions
    return templateOptions.filter((template) => template.name.toLowerCase().includes(term))
  }, [templateOptions, templateSearch])
  const hasTemplateSearch = templateSearch.trim().length > 0
  const showTemplateResults = showAllTemplates || hasTemplateSearch

  useEffect(() => {
    if (!selectedTemplate) return
    if (!templateOptions.some((template) => template.name === selectedTemplate.name)) {
      setSelectedTemplate(null)
      setTemplateSelected(false)
    }
  }, [selectedTemplate, templateOptions])

  // Pré-selecionar template da URL (ex: vindo de /templates com ?templateName=...)
  useEffect(() => {
    if (!preselectedTemplateName) return
    if (templateOptions.length === 0) return
    if (selectedTemplate) return // Já tem um selecionado, não sobrescrever

    const match = templateOptions.find(
      (t) => t.name.toLowerCase() === preselectedTemplateName.toLowerCase()
    )
    if (match) {
      setSelectedTemplate(match)
      setTemplateSelected(true)
    }
  }, [preselectedTemplateName, templateOptions, selectedTemplate])

  useEffect(() => {
    const phone = testContactQuery.data?.phone
    if (!phone) {
      setConfiguredContact(null)
      return
    }
    const controller = new AbortController()
    fetch('/api/contacts?limit=1&search=' + encodeURIComponent(phone), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        const contact = payload?.data?.[0]
        if (contact) setConfiguredContact(contact)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [testContactQuery.data?.phone])

  // Busca contagens de contatos por tag - só roda quando tagsQuery tem dados (step >= 2)
  useEffect(() => {
    const tags = (tagsQuery.data || []).slice(0, 30)
    if (!tags.length) return
    let cancelled = false
    Promise.all(
      tags.map(async (tag) => {
        const res = await fetchJson<{ total: number }>('/api/contacts?limit=1&tag=' + encodeURIComponent(tag))
        return [tag, res.total ?? 0] as const
      })
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, number> = {}
      pairs.forEach(([tag, total]) => {
        next[tag] = total
      })
      setTagCounts(next)
    })
    return () => {
      cancelled = true
    }
  }, [tagsQuery.data])

  const contactFields = [
    { key: 'nome', label: 'Nome' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'email', label: 'E-mail' },
  ]
  const sampleValues = useMemo(() => {
    const preferredContact = sendToSelected && selectedTestContact ? selectedTestContact : configuredContact
    const base = {
      nome: preferredContact?.name || configuredContact?.name || testContactQuery.data?.name || 'Contato',
      telefone:
        preferredContact?.phone ||
        configuredContact?.phone ||
        testContactQuery.data?.phone ||
        '+5511999990001',
      email: preferredContact?.email || 'contato@smartzap.com',
    } as Record<string, string>
    customFieldKeys.forEach((key) => {
      base[key] = base[key] || 'valor'
    })
    return base
  }, [
    configuredContact,
    customFieldKeys,
    selectedTestContact,
    sendToSelected,
    testContactQuery.data?.name,
    testContactQuery.data?.phone,
  ])

  const resolveValue = (key: string | undefined) => {
    if (!key) return ''
    return sampleValues[key] ?? key
  }

  const resolveCountry = (phone: string): string | null => {
    const normalized = normalizePhoneNumber(String(phone || '').trim())
    if (!normalized) return null
    try {
      const parsed = parsePhoneNumber(normalized)
      return parsed?.country || null
    } catch {
      return null
    }
  }

  const buildTemplateVariables = () => {
    if (!selectedTemplate) {
      return {
        header: templateVars.header.map((item) => item.value.trim()),
        body: templateVars.body.map((item) => item.value.trim()),
        buttons: {},
      }
    }

    try {
      const spec = buildTemplateSpecV1(selectedTemplate)
      const buttons = Object.fromEntries(
        Object.entries(templateButtonVars).map(([k, v]) => [k, String(v ?? '').trim()])
      )

      if (spec.parameterFormat === 'named') {
        // Mantém compatibilidade com os endpoints atuais (Meta API-style): arrays posicionais.
        // Para named, seguimos a ordem de requiredKeys do contrato.
        const headerOut = (spec.header?.requiredKeys || []).map((k) => {
          const item = templateVars.header.find((v) => v.key === k)
          return String(item?.value || '').trim()
        })
        const bodyOut = spec.body.requiredKeys.map((k) => {
          const item = templateVars.body.find((v) => v.key === k)
          return String(item?.value || '').trim()
        })

        return {
          header: headerOut,
          body: bodyOut,
          ...(Object.keys(buttons).length ? { buttons } : {}),
        }
      }

      const headerArr: string[] = []
      const bodyArr: string[] = []

      for (const v of templateVars.header) {
        const idx = Number(v.key)
        if (Number.isFinite(idx) && idx >= 1) headerArr[idx - 1] = v.value.trim()
      }

      for (const v of templateVars.body) {
        const idx = Number(v.key)
        if (Number.isFinite(idx) && idx >= 1) bodyArr[idx - 1] = v.value.trim()
      }

      const maxHeader = Math.max(0, ...(spec.header?.requiredKeys || []).map((k) => Number(k)).filter(Number.isFinite))
      const maxBody = Math.max(0, ...spec.body.requiredKeys.map((k) => Number(k)).filter(Number.isFinite))

      const headerOut = Array.from({ length: maxHeader }, (_, i) => headerArr[i] ?? '')
      const bodyOut = Array.from({ length: maxBody }, (_, i) => bodyArr[i] ?? '')

      return {
        header: headerOut,
        body: bodyOut,
        ...(Object.keys(buttons).length ? { buttons } : {}),
      }
    } catch {
      return {
        header: templateVars.header.map((item) => item.value.trim()),
        body: templateVars.body.map((item) => item.value.trim()),
        ...(Object.keys(templateButtonVars).length ? { buttons: templateButtonVars } : {}),
      }
    }
  }

  const resolveAudienceContacts = async (): Promise<Contact[]> => {
    if (audienceMode === 'teste') {
      const baseList: Contact[] = []
      if (sendToConfigured) {
        // Usa o contato real se existir
        let testContact = configuredContact

        // Se não existe no banco mas tem dados nas settings, cria o contato
        if (!testContact && testContactQuery.data?.phone) {
          try {
            const res = await fetch('/api/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: testContactQuery.data.phone,
                name: testContactQuery.data.name || 'Contato de Teste',
                status: 'Opt-in',
              }),
            })
            if (res.ok) {
              const created = await res.json() as Contact
              testContact = created
              setConfiguredContact(created)
            } else {
              throw new Error('Falha ao criar contato')
            }
          } catch (err) {
            console.error('Erro ao criar contato de teste:', err)
            // Fallback: tenta buscar caso já exista (race condition)
            try {
              const existing = await fetchJson<{ data: Contact[] }>(
                `/api/contacts?limit=1&search=${encodeURIComponent(testContactQuery.data.phone)}`
              )
              if (existing?.data?.[0]) {
                testContact = existing.data[0]
                setConfiguredContact(testContact)
              }
            } catch {
              // Se ainda falhar, não adiciona o contato
            }
          }
        }

        if (testContact) baseList.push(testContact)
      }
      if (sendToSelected && selectedTestContact) baseList.push(selectedTestContact)

      // Importantíssimo: após "Corrigir" (PATCH) ou "Aplicar em massa", o estado local pode ficar stale
      // (selectedTestContact/configuredContact não são geridos pelo cache do React Query).
      // Aqui, por ser no máximo 2 contatos, buscamos do servidor para garantir custom_fields atualizados.
      const uniq = Array.from(new Map(baseList.map((c) => [c.id, c])).values())

      const refreshed = await Promise.all(
        uniq.map(async (c) => {
          try {
            const latest = await fetchJson<Contact>(`/api/contacts/${encodeURIComponent(c.id)}`)
            return latest || c
          } catch {
            return c
          }
        })
      )

      return refreshed
    }

    const contacts = await fetchJson<Contact[]>('/api/contacts')
    if (audienceMode === 'todos') return contacts

    if (!selectedTags.length && !selectedCountries.length && !selectedStates.length) {
      return contacts
    }

    return contacts.filter((contact) => {
      const contactTags = Array.isArray(contact.tags) ? contact.tags : []
      const phone = String(contact.phone || '')
      const country = selectedCountries.length ? resolveCountry(phone) : null
      const uf = selectedStates.length ? getBrazilUfFromPhone(phone) : null

      const tagMatches = selectedTags.map((tag) => contactTags.includes(tag))
      const countryMatches = selectedCountries.map((code) => Boolean(country && country === code))
      const stateMatches = selectedStates.map((code) => Boolean(uf && uf === code))
      const filters = [...tagMatches, ...countryMatches, ...stateMatches]

      if (!filters.length) return true
      const isMatch = combineMode === 'or' ? filters.some(Boolean) : filters.every(Boolean)
      return isMatch
    })
  }

  const selectedTestCount =
    Number(Boolean(sendToConfigured && hasConfiguredContact)) + Number(Boolean(sendToSelected && selectedTestContact))

  const runPrecheck = async () => {
    if (!templateSelected || !selectedTemplate?.name) return
    if (audienceMode === 'teste' && selectedTestCount === 0) return

    setIsPrecheckLoading(true)
    setPrecheckError(null)
    try {
      const contacts = await resolveAudienceContacts()
      if (!contacts.length) {
        setPrecheckTotals({ valid: 0, skipped: 0 })
        setPrecheckError('Nenhum contato encontrado para validar.')
        setPrecheckResult(null)
        return
      }

      const result = await campaignService.precheck({
        templateName: selectedTemplate.name,
        contacts: contacts.map((contact) => ({
          contactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || undefined,
          custom_fields: contact.custom_fields || {},
        })),
        templateVariables: buildTemplateVariables(),
      })

      setPrecheckTotals({
        valid: result?.totals?.valid ?? 0,
        skipped: result?.totals?.skipped ?? 0,
      })

      setPrecheckResult(result)

      return result
    } catch (error) {
      setPrecheckError((error as Error)?.message || 'Falha ao validar destinatários.')
      setPrecheckTotals(null)
      setPrecheckResult(null)
      setSkipIgnored(false)
      return null
    } finally {
      setIsPrecheckLoading(false)
    }
  }

  const handleLaunch = async () => {
    if (!selectedTemplate?.name) return
    setIsLaunching(true)
    setLaunchError(null)
    try {
      const contacts = await resolveAudienceContacts()
      if (!contacts.length) {
        setLaunchError('Nenhum contato válido para envio.')
        return
      }

      // Alinha com /campaigns/new:
      // valida via pré-check no momento do envio/criação.
      // Se nenhum destinatário for válido, não cria a campanha.
      try {
        const precheck = await campaignService.precheck({
          templateName: selectedTemplate.name,
          contacts: contacts.map((contact) => ({
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            email: contact.email || undefined,
            custom_fields: contact.custom_fields || {},
          })),
          templateVariables: buildTemplateVariables(),
        })

        setPrecheckTotals({
          valid: precheck?.totals?.valid ?? 0,
          skipped: precheck?.totals?.skipped ?? 0,
        })

        setPrecheckResult(precheck)

        // Se houver ignorados por falta de variáveis obrigatórias, exige correção antes de lançar.
        const hasMissingRequired = Array.isArray((precheck as any)?.results)
          ? (precheck as any).results.some((r: any) => r && !r.ok && r.skipCode === 'MISSING_REQUIRED_PARAM')
          : false

        if ((precheck?.totals?.valid ?? 0) === 0) {
          setLaunchError('Nenhum destinatário válido para envio. Revise os ignorados e valide novamente.')
          return
        }

        if (hasMissingRequired && (precheck?.totals?.skipped ?? 0) > 0 && !skipIgnored) {
          setLaunchError('Existem contatos ignorados por falta de dados obrigatórios. Corrija os ignorados e valide novamente antes de lançar.')
          return
        }
      } catch (err) {
        // Mantém a UI consistente: falha de pré-check impede disparo.
        setLaunchError((err as Error)?.message || 'Falha ao validar destinatários antes do envio.')
        setPrecheckResult(null)
        return
      }

      const scheduledAt =
        scheduleMode === 'agendar' && scheduleDate && scheduleTime
          ? buildScheduledAt(scheduleDate, scheduleTime)
          : undefined

      // Extrair Flow do template (se houver botão do tipo FLOW)
      const { flowId, flowName } = extractFlowFromTemplate(selectedTemplate)

      const campaign = await campaignService.create({
        name: campaignName.trim(),
        templateName: selectedTemplate.name,
        selectedContacts: contacts.map((contact) => ({
          contactId: contact.id,
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          custom_fields: contact.custom_fields || {},
        })),
        recipients: contacts.length,
        scheduledAt,
        templateVariables: buildTemplateVariables(),
        flowId,
        flowName,
        folderId: selectedFolderId,
      })

      router.push(`/campaigns/${campaign.id}`)
    } catch (error) {
      setLaunchError((error as Error)?.message || 'Falha ao lancar campanha.')
    } finally {
      setIsLaunching(false)
    }
  }

  // Salvar como rascunho (não dispara a campanha)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const handleSaveDraft = async () => {
    if (!selectedTemplate?.name) return
    setIsSavingDraft(true)
    setLaunchError(null)
    try {
      const contacts = await resolveAudienceContacts()
      if (!contacts.length) {
        setLaunchError('Nenhum contato válido para salvar.')
        return
      }

      // Extrair Flow do template (se houver botão do tipo FLOW)
      const { flowId, flowName } = extractFlowFromTemplate(selectedTemplate)

      const campaign = await campaignService.create({
        name: campaignName.trim(),
        templateName: selectedTemplate.name,
        selectedContacts: contacts.map((contact) => ({
          contactId: contact.id,
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          custom_fields: contact.custom_fields || {},
        })),
        recipients: contacts.length,
        templateVariables: buildTemplateVariables(),
        flowId,
        flowName,
        folderId: selectedFolderId,
        isDraft: true, // <-- Salva como rascunho
      })

      // Redireciona para a lista de campanhas (não para os detalhes)
      router.push('/campaigns')
    } catch (error) {
      setLaunchError((error as Error)?.message || 'Falha ao salvar rascunho.')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const fixCandidates = useMemo(() => {
    const results = precheckResult?.results as any[] | undefined
    if (!results || !Array.isArray(results)) return [] as Array<{ contactId: string; focus: ContactFixFocus; title: string; subtitle: string }>

    const dedupeTargets = (targets: ContactFixTarget[]): ContactFixTarget[] => {
      const seen = new Set<string>()
      const out: ContactFixTarget[] = []
      for (const t of targets) {
        const id =
          t.type === 'email'
            ? 'email'
            : t.type === 'name'
              ? 'name'
              : `custom_field:${t.key}`
        if (seen.has(id)) continue
        seen.add(id)
        out.push(t)
      }
      return out
    }

    const focusFromTargets = (targets: ContactFixTarget[]): ContactFixFocus => {
      const uniq = dedupeTargets(targets)
      if (uniq.length === 0) return null
      if (uniq.length === 1) return uniq[0]
      return { type: 'multi', targets: uniq }
    }

    const out: Array<{ contactId: string; focus: ContactFixFocus; title: string; subtitle: string }> = []

    for (const r of results) {
      if (!r || r.ok) continue
      if (r.skipCode !== 'MISSING_REQUIRED_PARAM') continue
      if (!r.contactId) continue

      const human = humanizePrecheckReason(String(r.reason || ''), { customFieldLabelByKey })
      const missing = Array.isArray(r.missing) ? (r.missing as any[]) : []
      const targets: ContactFixTarget[] = []
      for (const m of missing) {
        const inf = humanizeVarSource(String(m?.raw || '<vazio>'), customFieldLabelByKey)
        if (inf.focus) targets.push(inf.focus)
      }
      const focus = focusFromTargets(targets) || human.focus || null

      // Se não temos nada focável (ex.: token de telefone), não oferece correção via modal.
      if (!focus) continue

      const name = String(r.name || '').trim()
      const phone = String(r.phone || '').trim()
      const label = name || phone || 'Contato'
      const subtitle = phone && label !== phone ? `${label} • ${phone}` : label

      out.push({
        contactId: String(r.contactId),
        focus,
        title: human.title || 'Corrigir contato',
        subtitle,
      })
    }

    // Ordena para uma experiência consistente.
    return out
      .sort((a, b) => a.subtitle.localeCompare(b.subtitle, 'pt-BR'))
  }, [precheckResult, customFieldLabelByKey])

  const bulkCustomFieldTargets = useMemo(() => {
    const results = precheckResult?.results as any[] | undefined
    if (!results || !Array.isArray(results)) return {} as Record<string, string[]>

    const map: Record<string, Set<string>> = {}

    for (const r of results) {
      if (!r || r.ok) continue
      if (r.skipCode !== 'MISSING_REQUIRED_PARAM') continue
      if (!r.contactId) continue

      const missing = Array.isArray(r.missing) ? (r.missing as any[]) : []
      for (const m of missing) {
        const inf = humanizeVarSource(String(m?.raw || ''), customFieldLabelByKey)
        if (!inf.focus) continue
        if (inf.focus.type !== 'custom_field') continue
        const key = String(inf.focus.key || '').trim()
        if (!key) continue
        if (!map[key]) map[key] = new Set<string>()
        map[key].add(String(r.contactId))
      }
    }

    const out: Record<string, string[]> = {}
    for (const [k, set] of Object.entries(map)) {
      out[k] = Array.from(set)
    }
    return out
  }, [precheckResult, customFieldLabelByKey])

  const systemMissingCounts = useMemo(() => {
    const results = precheckResult?.results as any[] | undefined
    if (!results || !Array.isArray(results)) return { name: 0, email: 0 }

    const name = new Set<string>()
    const email = new Set<string>()

    for (const r of results) {
      if (!r || r.ok) continue
      if (r.skipCode !== 'MISSING_REQUIRED_PARAM') continue
      if (!r.contactId) continue

      const missing = Array.isArray(r.missing) ? (r.missing as any[]) : []
      for (const m of missing) {
        const inf = humanizeVarSource(String(m?.raw || ''), customFieldLabelByKey)
        if (!inf.focus) continue
        if (inf.focus.type === 'name') name.add(String(r.contactId))
        if (inf.focus.type === 'email') email.add(String(r.contactId))
      }
    }

    return { name: name.size, email: email.size }
  }, [precheckResult, customFieldLabelByKey])

  const bulkKeys = useMemo(() => {
    const keys = Object.keys(bulkCustomFieldTargets)
    return keys.sort((a, b) => {
      const ca = bulkCustomFieldTargets[a]?.length ?? 0
      const cb = bulkCustomFieldTargets[b]?.length ?? 0
      if (cb !== ca) return cb - ca
      return a.localeCompare(b, 'pt-BR')
    })
  }, [bulkCustomFieldTargets])

  useEffect(() => {
    if (!bulkKeys.length) return
    setBulkKey((prev) => (prev && bulkCustomFieldTargets[prev]?.length ? prev : bulkKeys[0]))
  }, [bulkCustomFieldTargets, bulkKeys])

  const applyBulkCustomField = async () => {
    const key = bulkKey.trim()
    const value = bulkValue.trim()
    const contactIds = bulkCustomFieldTargets[key] || []

    if (!key) {
      setBulkError('Selecione um campo personalizado.')
      return
    }
    if (!value) {
      setBulkError('Informe o valor para aplicar.')
      return
    }
    if (!contactIds.length) {
      setBulkError('Nenhum contato elegível para esse campo.')
      return
    }

    setBulkLoading(true)
    setBulkError(null)
    try {
      const res = await fetch('/api/contacts/bulk-custom-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds, key, value }),
      })

      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || 'Falha ao aplicar em massa.')
      }

      setBulkOpen(false)
      setBulkValue('')
      // Revalida para refletir o desbloqueio.
      setTimeout(() => {
        runPrecheck()
      }, 0)
    } catch (err) {
      setBulkError((err as Error)?.message || 'Falha ao aplicar em massa.')
    } finally {
      setBulkLoading(false)
    }
  }

  const openQuickEdit = (item: { contactId: string; focus: ContactFixFocus; title: string }) => {
    setQuickEditContactId(item.contactId)
    setQuickEditFocus(item.focus)
    setQuickEditTitle(`Corrigir • ${item.title}`)
  }

  const startBatchFix = () => {
    if (!fixCandidates.length) return
    const queue = fixCandidates.map((c) => ({ contactId: c.contactId, focus: c.focus, title: c.title }))
    setBatchFixQueue(queue)
    setBatchFixIndex(0)
    openQuickEdit(queue[0])
  }

  const handleQuickEditSaved = () => {
    // Revalida best-effort após salvar.
    setTimeout(() => {
      runPrecheck()
    }, 0)

    if (!batchFixQueue.length) return
    const nextIdx = batchFixIndex + 1
    if (nextIdx < batchFixQueue.length) {
      batchNextRef.current = batchFixQueue[nextIdx]
      batchCloseReasonRef.current = 'advance'
    } else {
      batchCloseReasonRef.current = 'finish'
    }
  }

  const handleQuickEditClose = () => {
    // Se o modal fechou após salvar, decidimos se avançamos ou finalizamos.
    if (batchCloseReasonRef.current === 'advance' && batchNextRef.current) {
      const next = batchNextRef.current
      batchNextRef.current = null
      batchCloseReasonRef.current = null
      setBatchFixIndex((prev) => Math.min(prev + 1, Math.max(0, batchFixQueue.length - 1)))
      openQuickEdit(next)
      return
    }

    // Encerrar lote (ou fechamento manual).
    batchNextRef.current = null
    batchCloseReasonRef.current = null
    setBatchFixQueue([])
    setBatchFixIndex(0)
    setQuickEditContactId(null)
    setQuickEditFocus(null)
    setQuickEditTitle('Editar contato')
  }

  useEffect(() => {
    if (step !== 3) return
    if (!templateSelected || !selectedTemplate?.name) return
    if (audienceMode === 'teste' && selectedTestCount === 0) return
    runPrecheck()
  }, [
    step,
    templateSelected,
    selectedTemplate?.name,
    audienceMode,
    selectedTestCount,
    sendToConfigured,
    sendToSelected,
    selectedTestContact?.id,
    configuredContact?.id,
    combineMode,
    selectedTags.join(','),
    selectedCountries.join(','),
    selectedStates.join(','),
    templateVars.header.map((item) => item.value).join('|'),
    templateVars.body.map((item) => item.value).join('|'),
    Object.entries(templateButtonVars)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|'),
  ])

  const baseCount = statsQuery.data?.total ?? 0
  const segmentEstimate = segmentCountQuery.data?.matched ?? baseCount
  const audienceCount =
    audienceMode === 'todos' ? baseCount : audienceMode === 'segmentos' ? segmentEstimate : selectedTestCount
  const isSegmentCountLoading = audienceMode === 'segmentos' && segmentCountQuery.isFetching
  const formatCurrency = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`

  // Quando skipIgnored=true, usar apenas os contatos válidos do precheck
  const effectiveAudienceCount = skipIgnored && precheckTotals ? precheckTotals.valid : audienceCount
  const formattedAudienceCount = audienceMode === 'teste' ? selectedTestCount : effectiveAudienceCount
  const displayAudienceCount = isSegmentCountLoading ? 'Calculando...' : String(formattedAudienceCount)

  const hasPricing = Boolean(selectedTemplate?.category) && hasRate
  const basePricePerMessage = hasPricing
    ? getPricingBreakdown(selectedTemplate!.category, 1, 0, exchangeRate!).pricePerMessageBRLFormatted
    : 'R$ --'
  const audiencePricing = hasPricing
    ? getPricingBreakdown(selectedTemplate!.category, effectiveAudienceCount, 0, exchangeRate!)
    : null
  const audienceCostFormatted = hasPricing ? audiencePricing!.totalBRLFormatted : 'R$ --'
  const displayAudienceCost = isSegmentCountLoading ? '—' : audienceCostFormatted
  const pricePerMessageLabel = hasPricing ? `${audiencePricing!.pricePerMessageBRLFormatted}/msg` : 'R$ --/msg'
  const exchangeRateLabel = hasRate ? `USD/BRL ${exchangeRate!.toFixed(2).replace('.', ',')}` : 'Câmbio indisponível'
  // No Step 1 (Configuração), não faz sentido mostrar contagem/custo de audiência
  // porque o usuário ainda não selecionou o público
  const footerSummary =
    step === 1
      ? selectedTemplate?.name || 'Template selecionado'
      : audienceMode === 'teste'
        ? `${selectedTestCount || 0} contato${selectedTestCount === 1 ? '' : 's'} de teste`
        : isSegmentCountLoading
          ? 'Calculando estimativa...'
          : `${effectiveAudienceCount} contatos • ${audienceCostFormatted}`
  const activeTemplate = previewTemplate ?? (templateSelected ? selectedTemplate : null)

  const parameterFormat = (
    ((activeTemplate as any)?.parameter_format || activeTemplate?.parameterFormat || 'positional') as
      | 'positional'
      | 'named'
  )

  const previewContact = useMemo(
    () => ({
      contactId: configuredContact?.id || selectedTestContact?.id || 'preview',
      name: sampleValues.nome,
      phone: sampleValues.telefone,
      email: sampleValues.email,
      custom_fields:
        (sendToSelected && selectedTestContact ? selectedTestContact.custom_fields : configuredContact?.custom_fields) ||
        {},
    }),
    [configuredContact?.custom_fields, configuredContact?.id, sampleValues, selectedTestContact?.custom_fields, selectedTestContact?.id, sendToSelected]
  )

  const templateSpec = useMemo(() => {
    if (!activeTemplate) return null
    try {
      return buildTemplateSpecV1(activeTemplate)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao validar contrato do template'
      return { error: message } as any
    }
  }, [activeTemplate])

  const templateComponents = useMemo(() => {
    return (activeTemplate?.components || []) as import('@/types').TemplateComponent[]
  }, [activeTemplate])

  const headerExampleUrl = useMemo(() => {
    const header = templateComponents.find((c) => c.type === 'HEADER')
    if (!header) return null
    const format = header.format ? String(header.format).toUpperCase() : ''
    if (!['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) return null

    let exampleObj: any = header.example
    if (typeof exampleObj === 'string') {
      try {
        exampleObj = JSON.parse(exampleObj)
      } catch {
        exampleObj = undefined
      }
    }
    const arr = exampleObj?.header_handle
    const candidate = Array.isArray(arr) ? arr.find((item: any) => typeof item === 'string' && item.trim()) : null
    if (!candidate) return null
    return /^https?:\/\//i.test(String(candidate || '').trim()) ? String(candidate).trim() : null
  }, [templateComponents])


  const flattenedButtons = useMemo(() => {
    const out: Array<{ index: number; button: import('@/types').TemplateButton }> = []
    let idx = 0
    for (const c of templateComponents) {
      if (c.type !== 'BUTTONS') continue
      const btns = (c.buttons || []) as import('@/types').TemplateButton[]
      for (const b of btns) {
        out.push({ index: idx, button: b })
        idx += 1
      }
    }
    return out
  }, [templateComponents])

  const resolvedHeader = useMemo(() => {
    if (!templateSpec || (templateSpec as any).error) return null
    const spec = templateSpec as ReturnType<typeof buildTemplateSpecV1>
    if (!spec.header?.requiredKeys?.length) {
      return spec.parameterFormat === 'named' ? ({} as Record<string, string>) : ([] as string[])
    }

    const getPreviewValue = (item: TemplateVar | undefined, key: string) => {
      const fallback = item?.placeholder || `{{${key}}}`
      const raw = item?.value?.trim() ? item.value : fallback
      // Quando não há valor preenchido, manter o placeholder no preview (evita "**" em OTP: *{{1}}* -> **)
      if (raw === fallback) return fallback
      const resolved = resolveVarValue(raw, previewContact)
      // Se for variável dinâmica ({{...}}) e não existir no contato de preview, não "apague" o token.
      // Isso evita bloquear o fluxo no passo 1 e mantém o preview informativo.
      if (!String(resolved || '').trim() && /\{\{[^}]+\}\}/.test(raw)) return raw
      return resolved
    }

    if (spec.parameterFormat === 'named') {
      const out: Record<string, string> = {}
      for (const k of spec.header.requiredKeys) {
        const item = templateVars.header.find((v) => v.key === k)
        out[k] = getPreviewValue(item, k)
      }
      return out
    }

    const arr: string[] = []
    for (const k of spec.header.requiredKeys) {
      const item = templateVars.header.find((v) => v.key === k)
      const resolved = getPreviewValue(item, k)
      const idx = Number(k)
      if (Number.isFinite(idx) && idx >= 1) arr[idx - 1] = resolved
    }
    return arr.map((v) => v ?? '')
  }, [previewContact, templateSpec, templateVars.header])

  const resolvedBody = useMemo(() => {
    if (!templateSpec || (templateSpec as any).error) return null
    const spec = templateSpec as ReturnType<typeof buildTemplateSpecV1>

    const getPreviewValue = (item: TemplateVar | undefined, key: string) => {
      const fallback = item?.placeholder || `{{${key}}}`
      const raw = item?.value?.trim() ? item.value : fallback
      if (raw === fallback) return fallback
      const resolved = resolveVarValue(raw, previewContact)
      if (!String(resolved || '').trim() && /\{\{[^}]+\}\}/.test(raw)) return raw
      return resolved
    }

    if (spec.parameterFormat === 'named') {
      const out: Record<string, string> = {}
      for (const k of spec.body.requiredKeys) {
        const item = templateVars.body.find((v) => v.key === k)
        out[k] = getPreviewValue(item, k)
      }
      return out
    }

    const arr: string[] = []
    for (const k of spec.body.requiredKeys) {
      const item = templateVars.body.find((v) => v.key === k)
      const resolved = getPreviewValue(item, k)
      const idx = Number(k)
      if (Number.isFinite(idx) && idx >= 1) arr[idx - 1] = resolved
    }
    return arr.map((v) => v ?? '')
  }, [previewContact, templateSpec, templateVars.body])

  const buttonAudit = useMemo(() => {
    if (!templateSpec || (templateSpec as any).error) return []
    const spec = templateSpec as ReturnType<typeof buildTemplateSpecV1>

    return spec.buttons.map((b) => {
      const uiButton = flattenedButtons.find((x) => x.index === b.index)?.button
      const base = {
        index: b.index,
        kind: b.kind,
        text: uiButton?.text || `Botão ${b.index + 1}`,
        type: uiButton?.type,
        isDynamic: b.kind === 'url' ? b.isDynamic : false,
        requiredKeys: b.kind === 'url' ? b.requiredKeys : [],
        url: uiButton?.url,
        phone: (uiButton as any)?.phone_number as string | undefined,
      }

      if (b.kind !== 'url' || !b.isDynamic || !base.url) return { ...base, resolvedUrl: base.url }

      const k = b.requiredKeys[0]
      const raw = templateButtonVars[`button_${b.index}_${k}`] || ''
      const resolved = resolveVarValue(raw, previewContact)
      const resolvedUrl = replaceTemplatePlaceholders({
        text: base.url,
        parameterFormat: 'positional',
        positionalValues: [resolved],
      })
      return { ...base, resolvedUrl, resolvedParam: resolved, rawParam: raw }
    })
  }, [flattenedButtons, previewContact, templateButtonVars, templateSpec])

  // Verifica se o template tem variáveis para preencher (header, body ou buttons dinâmicos)
  const hasTemplateVariables =
    templateVars.header.length > 0 ||
    templateVars.body.length > 0 ||
    buttonAudit.some((b: any) => b.kind === 'url' && b.isDynamic) ||
    !!templateSpecError

  const missingTemplateVars = useMemo(() => {
    // Importante: no passo 1, a regra é "preencher todos os campos obrigatórios".
    // NÃO validamos se a variável dinâmica existe no contato de teste aqui.
    // A validação de existência/resultado real ocorre no pré-check (etapa de público).
    const isFilled = (v: unknown) => String(v ?? '').trim().length > 0

    // Fallback: se não conseguimos montar spec, validamos pelo estado atual dos campos.
    if (!templateSpec || (templateSpec as any).error) {
      return [...templateVars.header, ...templateVars.body].filter((item) => item.required && !isFilled(item.value)).length
    }

    const spec = templateSpec as ReturnType<typeof buildTemplateSpecV1>
    let missing = 0

    for (const k of spec.header?.requiredKeys || []) {
      const item = templateVars.header.find((v) => v.key === k)
      if (!isFilled(item?.value)) missing += 1
    }

    for (const k of spec.body.requiredKeys) {
      const item = templateVars.body.find((v) => v.key === k)
      if (!isFilled(item?.value)) missing += 1
    }

    for (const b of spec.buttons) {
      if (b.kind !== 'url' || !b.isDynamic) continue
      for (const k of b.requiredKeys) {
        const raw = templateButtonVars[`button_${b.index}_${k}`]
        if (!isFilled(raw)) missing += 1
      }
    }

    return missing
  }, [previewContact, templateButtonVars, templateSpec, templateVars.body, templateVars.header])

  const isConfigComplete = Boolean(campaignName.trim()) && templateSelected && missingTemplateVars === 0
  const isAudienceComplete = audienceMode === 'teste' ? selectedTestCount > 0 : audienceCount > 0
  const precheckNeedsFix =
    Boolean(precheckTotals && precheckTotals.skipped > 0) && (fixCandidates.length > 0 || bulkKeys.length > 0)
  const isPrecheckOk =
    Boolean(precheckTotals) &&
    !precheckError &&
    !isPrecheckLoading &&
    (precheckTotals?.valid ?? 0) > 0 &&
    (!precheckNeedsFix || skipIgnored)
  const isScheduleComplete =
    scheduleMode !== 'agendar' || (scheduleDate.trim().length > 0 && scheduleTime.trim().length > 0)
  const canContinue =
    step === 1 ? isConfigComplete : step === 2 ? isAudienceComplete : step === 3 ? isPrecheckOk : isScheduleComplete
  const scheduleLabel = scheduleMode === 'agendar' ? 'Agendado' : 'Imediato'
  const scheduleSummaryLabel =
    step >= 4
      ? scheduleLabel
      : precheckNeedsFix && !skipIgnored
        ? 'Bloqueado (validação pendente)'
        : 'A definir'
  const combineModeLabel = combineMode === 'or' ? 'Mais alcance' : 'Mais preciso'
  const combineFilters = [...selectedTags, ...selectedCountries, ...selectedStates]
  const combinePreview = combineFilters.length
    ? combineFilters.join(' • ')
    : 'Nenhum filtro selecionado'
  const countryData = countriesQuery.data?.data || []
  const stateData = statesQuery.data?.data || []
  const tagChips = (tagsQuery.data || []).slice(0, 30)
  const countryChips = countryData.map((item) => item.code)
  const stateChips = stateData.map((item) => item.code)
  const countryCounts = useMemo(() => {
    const next: Record<string, number> = {}
    countryData.forEach((item) => {
      next[item.code] = item.count
    })
    return next
  }, [countryData])
  const stateCounts = useMemo(() => {
    const next: Record<string, number> = {}
    stateData.forEach((item) => {
      next[item.code] = item.count
    })
    return next
  }, [stateData])
  const isBrSelected = selectedCountries.includes('BR')
  const stateChipsToShow = stateChips.slice(0, 3)
  const hiddenStateCount = Math.max(0, stateChips.length - stateChipsToShow.length)
  const stateSearchTerm = stateSearch.trim().toLowerCase()
  const filteredStates = stateData.filter((item) =>
    stateSearchTerm ? item.code.toLowerCase().includes(stateSearchTerm) : true
  )
  const toggleSelection = (value: string, current: string[], setCurrent: (next: string[]) => void) => {
    setCurrent(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  useEffect(() => {
    if (!selectedTemplate) return
    setTemplateSpecError(null)
    setTemplateButtonVars({})

    try {
      const spec = buildTemplateSpecV1(selectedTemplate)
      const mapKeys = (keys: string[]) =>
        keys.map((key) => ({
          key,
          placeholder: `{{${key}}}`,
          value: '',
          required: true,
        }))

      const initialVars = {
        header: mapKeys(spec.header?.requiredKeys || []),
        body: mapKeys(spec.body.requiredKeys || []),
      }

      setTemplateVars(initialVars)

      // BYPASS: Busca marketing_variables para pré-preencher
      // Se o template veio de um projeto BYPASS, os valores promocionais ficam em marketing_variables
      const fetchMarketingVars = async () => {
        try {
          const response = await fetch(`/api/templates/${encodeURIComponent(selectedTemplate.name)}/marketing-variables`)
          if (!response.ok) return

          const data = await response.json()
          if (data.marketing_variables && data.strategy === 'bypass') {
            // Pré-preenche com marketing_variables
            setTemplateVars(prev => ({
              header: prev.header.map(item => ({
                ...item,
                value: data.marketing_variables[item.key] || item.value
              })),
              body: prev.body.map(item => ({
                ...item,
                value: data.marketing_variables[item.key] || item.value
              }))
            }))
          }
        } catch {
          // Silenciosamente ignora erros - marketing_variables é opcional
        }
      }

      fetchMarketingVars()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao validar contrato do template'
      setTemplateSpecError(message)
      setTemplateVars({ header: [], body: [] })
    }
  }, [selectedTemplate?.name])

  const setTemplateVarValue = (section: 'header' | 'body', index: number, value: string) => {
    setTemplateVars((prev) => {
      const next = { ...prev, [section]: [...prev[section]] }
      next[section][index] = { ...next[section][index], value }
      return next
    })
  }

  const setButtonVarValue = (buttonIndex: number, key: string, value: string) => {
    setTemplateButtonVars((prev) => ({
      ...prev,
      [`button_${buttonIndex}_${key}`]: value,
    }))
  }

  return {
    // Navigation
    router,
    step,
    setStep,

    // Campaign config
    campaignName,
    setCampaignName,
    categoryFilter,
    setCategoryFilter,

    // Template selection
    templateSelected,
    setTemplateSelected,
    selectedTemplate,
    setSelectedTemplate,
    previewTemplate,
    setPreviewTemplate,
    showAllTemplates,
    setShowAllTemplates,
    templateSearch,
    setTemplateSearch,
    templatesQuery,
    templateOptions,
    recentTemplates,
    recommendedTemplates,
    filteredTemplates,
    hasTemplateSearch,
    showTemplateResults,
    activeTemplate,

    // Template variables
    templateVars,
    templateButtonVars,
    templateSpecError,
    hasTemplateVariables,
    missingTemplateVars,
    setTemplateVarValue,
    setButtonVarValue,
    templateSpec,
    templateComponents,
    headerExampleUrl,
    flattenedButtons,
    resolvedHeader,
    resolvedBody,
    buttonAudit,
    parameterFormat,

    // Custom fields
    customFields,
    customFieldKeys,
    customFieldLabelByKey,
    customFieldsQuery,
    isFieldsSheetOpen,
    setIsFieldsSheetOpen,
    contactFields,

    // Audience
    audienceMode,
    setAudienceMode,
    combineMode,
    setCombineMode,
    collapseAudienceChoice,
    setCollapseAudienceChoice,
    collapseQuickSegments,
    setCollapseQuickSegments,

    // Tags
    selectedTags,
    setSelectedTags,
    tagsQuery,
    tagChips,
    tagCounts,

    // Countries
    selectedCountries,
    setSelectedCountries,
    countriesQuery,
    countryChips,
    countryCounts,

    // States
    selectedStates,
    setSelectedStates,
    statesQuery,
    stateChips,
    stateChipsToShow,
    hiddenStateCount,
    showStatesPanel,
    setShowStatesPanel,
    stateSearch,
    setStateSearch,
    filteredStates,
    stateCounts,
    isBrSelected,

    // Stats & segments
    statsQuery,
    segmentCountQuery,
    baseCount,
    audienceCount,
    isSegmentCountLoading,

    // Test contacts
    testContactSearch,
    setTestContactSearch,
    selectedTestContact,
    setSelectedTestContact,
    configuredContact,
    sendToConfigured,
    setSendToConfigured,
    sendToSelected,
    setSendToSelected,
    testContactQuery,
    contactSearchQuery,
    displayTestContacts,
    configuredLabel,
    hasConfiguredContact,
    selectedTestCount,

    // Precheck
    isPrecheckLoading,
    precheckError,
    precheckTotals,
    precheckResult,
    skipIgnored,
    setSkipIgnored,
    runPrecheck,
    isPrecheckOk,
    precheckNeedsFix,
    fixCandidates,

    // Quick edit / batch fix
    quickEditContactId,
    quickEditFocus,
    quickEditTitle,
    openQuickEdit,
    startBatchFix,
    handleQuickEditSaved,
    handleQuickEditClose,

    // Bulk custom field
    bulkOpen,
    setBulkOpen,
    bulkKey,
    setBulkKey,
    bulkValue,
    setBulkValue,
    bulkError,
    setBulkError,
    bulkLoading,
    bulkKeys,
    bulkCustomFieldTargets,
    systemMissingCounts,
    applyBulkCustomField,

    // Schedule
    scheduleMode,
    setScheduleMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    userTimeZone,
    isDatePickerOpen,
    setIsDatePickerOpen,

    // Folders
    selectedFolderId,
    setSelectedFolderId,
    folders,
    isFoldersLoading,

    // Launch
    isLaunching,
    launchError,
    handleLaunch,

    // Draft
    isSavingDraft,
    handleSaveDraft,

    // Pricing
    hasPricing,
    basePricePerMessage,
    audiencePricing,
    audienceCostFormatted,
    displayAudienceCost,
    pricePerMessageLabel,
    exchangeRateLabel,

    // Computed flags
    isConfigComplete,
    isAudienceComplete,
    isScheduleComplete,
    canContinue,

    // Display values
    displayAudienceCount,
    effectiveAudienceCount,
    footerSummary,
    scheduleLabel,
    scheduleSummaryLabel,
    combineModeLabel,
    combineFilters,
    combinePreview,

    // Helpers
    toggleSelection,
    formatCurrency,
    resolveValue,
    sampleValues,
    previewContact,
  }
}
