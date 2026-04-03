import React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { useFlowEditorController } from '@/hooks/useFlowEditor'
import { FLOW_TEMPLATES } from '@/lib/flow-templates'
import { flowJsonToFormSpec } from '@/lib/flow-form'
import {
  dynamicFlowSpecFromJson,
  bookingConfigToDynamicSpec,
  formSpecToDynamicSpec,
  type DynamicFlowSpecV1,
  generateDynamicFlowJson,
  getDefaultBookingFlowConfig,
  normalizeBookingFlowConfig,
} from '@/lib/dynamic-flow'

export const useFlowBuilderController = (id: string) => {
  const router = useRouter()
  const controller = useFlowEditorController(id)

  const flow = controller.flow

  const [name, setName] = React.useState('')
  const [metaFlowId, setMetaFlowId] = React.useState<string>('')
  const [step, setStep] = React.useState<1 | 2 | 3>(1)
  const [formPreviewJson, setFormPreviewJson] = React.useState<unknown>(null)
  const [templateSelectedPreviewJson, setTemplateSelectedPreviewJson] = React.useState<unknown>(null)
  const [templateHoverPreviewJson, setTemplateHoverPreviewJson] = React.useState<unknown>(null)
  const [formPreviewSelectedScreenId, setFormPreviewSelectedScreenId] = React.useState<string | null>(null)
  const [previewSelectedEditorKey, setPreviewSelectedEditorKey] = React.useState<string | null>(null)
  const [previewDynamicSpec, setPreviewDynamicSpec] = React.useState<DynamicFlowSpecV1 | null>(null)
  const [editorSpecOverride, setEditorSpecOverride] = React.useState<unknown>(null)
  const [startMode, setStartMode] = React.useState<'ai' | 'template' | 'zero' | null>(null)
  const stepRef = React.useRef(step)
  const startModeRef = React.useRef(startMode)
  const controllerSpecRef = React.useRef(controller.spec as unknown)
  const editorSpecOverrideRef = React.useRef(editorSpecOverride)

  React.useEffect(() => {
    stepRef.current = step
    startModeRef.current = startMode
    controllerSpecRef.current = controller.spec as unknown
    editorSpecOverrideRef.current = editorSpecOverride
  }, [controller.spec, editorSpecOverride, startMode, step])

  const handleEditorPreviewChange = React.useCallback(
    ({ spec, generatedJson, activeScreenId }: { spec?: DynamicFlowSpecV1 | null; generatedJson: unknown; activeScreenId?: string | null }) => {
      const stepNow = stepRef.current
      const startModeNow = startModeRef.current
      const hadOverride = !!editorSpecOverrideRef.current
      // #region agent log
      try {
        const screens = Array.isArray((generatedJson as any)?.screens) ? (generatedJson as any).screens : []
        const firstScreenId = screens.length ? String(screens[0]?.id || '') : null
      } catch {}
      // #endregion agent log
      setFormPreviewJson(generatedJson)
      setPreviewDynamicSpec(spec || null)
      // #region agent log
      try {
        const screens = Array.isArray((generatedJson as any)?.screens) ? (generatedJson as any).screens : []
        const firstScreenId = screens.length ? String(screens[0]?.id || '') : null
      } catch {}
      // #endregion agent log
      setEditorSpecOverride((prev: unknown) => {
        if (prev) return prev
        const base = controllerSpecRef.current && typeof controllerSpecRef.current === 'object' ? (controllerSpecRef.current as any) : {}
        return { ...base, dynamicFlow: spec }
      })
      setFormPreviewSelectedScreenId(activeScreenId || null)
    },
    []
  )
  const [aiPrompt, setAiPrompt] = React.useState('')
  const [aiLoading, setAiLoading] = React.useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState<string>(FLOW_TEMPLATES[0]?.key || '')
  const [hoverTemplateKey, setHoverTemplateKey] = React.useState<string | null>(null)
  const hoverPreviewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showAdvancedPanel, setShowAdvancedPanel] = React.useState(false)

  const advancedGate = React.useMemo(() => {
    const hasJson = !!formPreviewJson && typeof formPreviewJson === 'object'
    const hasRouting = hasJson ? !!(formPreviewJson as any)?.routing_model : false
    return { hasJson, hasRouting, canRender: !!showAdvancedPanel && hasJson && hasRouting }
  }, [formPreviewJson, showAdvancedPanel])

  React.useEffect(() => {
    if (!showAdvancedPanel) return
    // #region agent log
    // #endregion agent log
  }, [advancedGate.hasJson, advancedGate.hasRouting, showAdvancedPanel, startMode, step])

  React.useEffect(() => {
    if (!showAdvancedPanel) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // #region agent log
      // #endregion agent log
      setShowAdvancedPanel(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showAdvancedPanel])

  React.useEffect(() => {
    // #region agent log
    // #endregion agent log
  }, [showAdvancedPanel])

  React.useEffect(() => {
    // #region agent log
    // #endregion agent log
  }, [startMode, step])

  const handleGenerateWithAI = React.useCallback(async () => {
    if (aiLoading) return
    if (!aiPrompt.trim() || aiPrompt.trim().length < 10) {
      toast.error('Descreva melhor o que você quer (mínimo 10 caracteres)')
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/generate-flow-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          titleHint: name,
          maxQuestions: 10,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (data?.error && String(data.error)) || 'Falha ao gerar miniapp com IA'
        const details = data?.details ? `: ${String(data.details)}` : ''
        throw new Error(`${msg}${details}`)
      }
      const generatedForm = data?.form
      if (!generatedForm) throw new Error('Resposta inválida da IA (form ausente)')

      const dynamicSpec = formSpecToDynamicSpec(generatedForm, name || 'MiniApp')
      const dynamicJson = generateDynamicFlowJson(dynamicSpec)
      setFormPreviewJson(dynamicJson)
      controller.save({
        spec: { ...(controller.spec as any), form: generatedForm, dynamicFlow: dynamicSpec },
        flowJson: dynamicJson,
      })
      setStep(2)
      toast.success('MiniApp gerada! Ajuste as telas e publique.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar miniapp com IA')
    } finally {
      setAiLoading(false)
    }
  }, [aiLoading, aiPrompt, controller, name])

  const handleApplyTemplate = React.useCallback(() => {
    const tpl = FLOW_TEMPLATES.find((t) => t.key === selectedTemplateKey)
    if (!tpl) return
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
    // Usa tpl.form se disponível (para templates dinâmicos), senão converte do flowJson
    const form = tpl.form
      ? { ...tpl.form, title: name || tpl.form.title }
      : flowJsonToFormSpec(tpl.flowJson, name || 'MiniApp')
    if (tpl.key === 'agendamento_dinamico_v1') {
      const normalized = normalizeBookingFlowConfig(tpl.dynamicConfig || getDefaultBookingFlowConfig())
      const dynamicSpec = bookingConfigToDynamicSpec(normalized)
      const dynamicJson = generateDynamicFlowJson(dynamicSpec)
      try {
        const screens = Array.isArray((dynamicJson as any)?.screens) ? (dynamicJson as any).screens : []
        const successScreen = screens.find((s:any) => s?.id === 'SUCCESS')
        const successChildren = successScreen?.layout?.children || []
        // #region agent log
        // #endregion agent log
      } catch {}
      setFormPreviewJson(dynamicJson)
      setPreviewDynamicSpec(dynamicSpec)
      setEditorSpecOverride({ ...(controller.spec as any), form, booking: normalized, dynamicFlow: dynamicSpec })
      controller.save({
        spec: { ...(controller.spec as any), form, booking: normalized, dynamicFlow: dynamicSpec },
        flowJson: dynamicJson,
        templateKey: tpl.key,
      })
      try {
        // #region agent log
        // #endregion agent log
      } catch {}
      setStep(2)
      toast.success('Template aplicado! Ajuste as telas e publique.')
      return
    }
    const dynamicSpec = tpl.isDynamic ? dynamicFlowSpecFromJson(tpl.flowJson as any) : formSpecToDynamicSpec(form, name || 'MiniApp')
    const dynamicJson = tpl.isDynamic ? tpl.flowJson : generateDynamicFlowJson(dynamicSpec)
    try {
      const screens = Array.isArray((dynamicJson as any)?.screens) ? (dynamicJson as any).screens : []
      // #region agent log
      // #endregion agent log
    } catch {}
    setFormPreviewJson(dynamicJson)
    setPreviewDynamicSpec(dynamicSpec as any)
    setEditorSpecOverride({ ...(controller.spec as any), form, dynamicFlow: dynamicSpec, ...(tpl.key ? { templateKey: tpl.key } : {}) })
    controller.save({
      spec: { ...(controller.spec as any), form, dynamicFlow: dynamicSpec },
      flowJson: dynamicJson,
      templateKey: tpl.key,
    })
    try {
      // #region agent log
      // #endregion agent log
    } catch {}
    setStep(2)
    toast.success(tpl.isDynamic
      ? 'Template dinâmico aplicado! O agendamento em tempo real será configurado ao publicar.'
      : 'Modelo aplicado! Ajuste as telas.')
  }, [controller, name, selectedTemplateKey])

  const computeTemplatePreviewJson = React.useCallback((tpl: any): unknown => {
    // Preview deve refletir o que será aplicado (sem salvar).
    const form = tpl.form
      ? { ...tpl.form, title: name || tpl.form.title }
      : flowJsonToFormSpec(tpl.flowJson, name || 'MiniApp')
    if (tpl.key === 'agendamento_dinamico_v1') {
      const normalized = normalizeBookingFlowConfig(tpl.dynamicConfig || getDefaultBookingFlowConfig())
      const dynamicSpec = bookingConfigToDynamicSpec(normalized)
      return generateDynamicFlowJson(dynamicSpec)
    }
    const dynamicSpec = tpl.isDynamic ? dynamicFlowSpecFromJson(tpl.flowJson as any) : formSpecToDynamicSpec(form, name || 'MiniApp')
    return tpl.isDynamic ? tpl.flowJson : generateDynamicFlowJson(dynamicSpec)
  }, [name])

  const handleTemplateHover = React.useCallback((tpl: { flowJson: unknown; key?: string; form?: any; isDynamic?: boolean }) => {
    if (tpl.key) {
      setHoverTemplateKey(tpl.key)
    }
    // Aplica preview imediatamente para evitar "flash" do selecionado antes do hover.
    try {
      const immediateJson = computeTemplatePreviewJson(tpl)
      // #region agent log
      // #endregion agent log
      setTemplateHoverPreviewJson(immediateJson)
    } catch {
      // ignore
    }
    if (hoverPreviewTimerRef.current) {
      // #region agent log
      // #endregion agent log
      clearTimeout(hoverPreviewTimerRef.current)
    }
    // #region agent log
    // #endregion agent log
    hoverPreviewTimerRef.current = setTimeout(() => {
      try {
        // #region agent log
        // #endregion agent log
        const nextJson = computeTemplatePreviewJson(tpl)
        // #region agent log
        // #endregion agent log
        setTemplateHoverPreviewJson(nextJson)
      } catch {
        // ignore hover preview errors
      }
    }, 150)
  }, [computeTemplatePreviewJson, name])

  React.useEffect(() => {
    const current = step === 1 && startMode === 'template'
      ? (templateHoverPreviewJson || templateSelectedPreviewJson)
      : formPreviewJson
    if (!current || typeof current !== 'object') return
    const screens = Array.isArray((current as any).screens) ? (current as any).screens : []
    const firstScreenId = screens.length ? String(screens[0]?.id || '') : null
    // #region agent log
    // #endregion agent log
  }, [formPreviewJson, startMode, step, templateHoverPreviewJson, templateSelectedPreviewJson])

  React.useEffect(() => {
    // #region agent log
    // #endregion agent log
  }, [selectedTemplateKey])

  React.useEffect(() => {
    if (!flow) return
    // Só sincroniza quando o registro muda (ou quando ainda não há valor no state)
    setName((prev) => prev || flow.name || '')
    setMetaFlowId((prev) => prev || flow.meta_flow_id || '')
    if (flow.template_key) {
      setSelectedTemplateKey(flow.template_key)
    }
    // Se vier de um fluxo já salvo, mostra no preview imediatamente.
    const savedJson = (flow as any)?.flow_json
    if (savedJson && typeof savedJson === 'object') {
      setFormPreviewJson((prev: unknown) => prev || savedJson)
      // Se o flow já tem conteúdo salvo, pula direto para o step 2 (edição)
      setStep((prev) => prev === 1 ? 2 : prev)
    }
    setEditorSpecOverride(null)
  }, [flow?.id])

  // No passo 1, só mostramos prévia quando o usuário está escolhendo um modelo pronto.
  // Em "Criar com IA" (e antes de escolher), não existe conteúdo para pré-visualizar ainda.
  const previewFlowJson =
    step === 1
      ? (startMode === 'template' ? (templateHoverPreviewJson || templateSelectedPreviewJson || null) : null)
      : formPreviewJson || (flow as any)?.flow_json

  React.useEffect(() => {
    const source =
      step === 1
        ? startMode === 'template'
          ? templateHoverPreviewJson
            ? 'template-hover'
            : templateSelectedPreviewJson
              ? 'template-selected'
              : 'none'
          : 'none'
        : formPreviewJson
          ? 'editor-state'
          : (flow as any)?.flow_json
            ? 'db'
            : 'none'
    const json = previewFlowJson as any
    const screens = json && typeof json === 'object' && Array.isArray(json.screens) ? json.screens : []
    const firstScreenId = screens.length ? String(screens[0]?.id || '') : null
    // #region agent log
    // #endregion agent log
  }, [formPreviewJson, formPreviewSelectedScreenId, previewFlowJson, selectedTemplateKey, startMode, step, templateHoverPreviewJson, templateSelectedPreviewJson])

  React.useEffect(() => {
    if (step !== 1 || startMode !== 'template') return
    // garante que ao abrir "Usar modelo pronto" exista um preview "selecionado"
    const tpl = FLOW_TEMPLATES.find((t) => t.key === selectedTemplateKey)
    if (!tpl) return
    const nextJson = computeTemplatePreviewJson(tpl)
    // #region agent log
    // #endregion agent log
    setTemplateSelectedPreviewJson(nextJson)
  }, [computeTemplatePreviewJson, selectedTemplateKey, startMode, step])

  React.useEffect(() => {
    // quando mudar de tela, limpa seleção anterior
    setPreviewSelectedEditorKey(null)
  }, [formPreviewSelectedScreenId])

  const shouldShowLoading = controller.isLoading
  const metaStatus = String((flow as any)?.meta_status || '').toUpperCase()
  const hasMetaErrors = Array.isArray((flow as any)?.meta_validation_errors)
    ? (flow as any).meta_validation_errors.length > 0
    : !!(flow as any)?.meta_validation_errors
  const statusLabel = metaStatus === 'PUBLISHED'
    ? 'Publicado'
    : metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW'
      ? 'Em revisão'
      : metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasMetaErrors
        ? 'Requer ação'
        : metaStatus
          ? metaStatus
          : 'Rascunho'
  const statusClass = metaStatus === 'PUBLISHED'
    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
    : metaStatus === 'PENDING' || metaStatus === 'IN_REVIEW' || metaStatus === 'REJECTED' || metaStatus === 'ERROR' || hasMetaErrors
      ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
      : 'border-white/10 bg-zinc-950/40 text-gray-300'
  const steps = [
    { id: 1, label: 'Começar' },
    { id: 2, label: 'Conteúdo' },
    { id: 3, label: 'Finalizar' },
  ] as const

  const collectFieldCatalog = React.useCallback((spec: DynamicFlowSpecV1 | null) => {
    const out: Array<{ name: string; label: string }> = []
    if (!spec) return out
    const supported = new Set([
      'TextInput',
      'TextArea',
      'Dropdown',
      'RadioButtonsGroup',
      'CheckboxGroup',
      'DatePicker',
      'CalendarPicker',
      'OptIn',
    ])
    const seen = new Set<string>()
    const walk = (nodes: any[]) => {
      for (const n of nodes || []) {
        if (!n || typeof n !== 'object') continue
        const type = typeof (n as any).type === 'string' ? String((n as any).type) : ''
        const name = typeof (n as any).name === 'string' ? String((n as any).name).trim() : ''
        if (name && supported.has(type) && !seen.has(name)) {
          const rawLabel =
            typeof (n as any).label === 'string'
              ? String((n as any).label).trim()
              : typeof (n as any).text === 'string'
                ? String((n as any).text).trim()
                : ''
          seen.add(name)
          out.push({ name, label: rawLabel || name })
        }
        const children = Array.isArray((n as any).children) ? (n as any).children : null
        if (children?.length) walk(children)
      }
    }
    for (const s of spec.screens || []) {
      walk(Array.isArray((s as any).components) ? (s as any).components : [])
    }
    return out
  }, [])

  const finalScreenId = React.useMemo(() => {
    const spec = previewDynamicSpec
    if (!spec || !Array.isArray(spec.screens) || spec.screens.length === 0) return null
    const finals = spec.screens.filter((s) => !!(s as any)?.terminal || String((s as any)?.action?.type || '').toLowerCase() === 'complete')
    const chosen = finals.length ? finals[finals.length - 1] : spec.screens[spec.screens.length - 1]
    return chosen?.id || null
  }, [previewDynamicSpec])

  const resolveConfirmationBinding = React.useCallback((raw: unknown, screen: any) => {
    const text = typeof raw === 'string' ? raw : ''
    const match = text.match(/^\$\{data\.([a-zA-Z0-9_]+)\}$/)
    if (!match) return text
    if (!screen?.data || typeof screen.data !== 'object') return text
    const dataNode = (screen.data as any)[match[1]]
    if (dataNode && typeof dataNode === 'object' && '__example__' in dataNode) {
      const example = (dataNode as any).__example__
      return example != null ? String(example) : ''
    }
    return text
  }, [])

  const confirmationState = React.useMemo(() => {
    const spec = previewDynamicSpec
    if (!spec || !finalScreenId) return null
    const s: any = (spec.screens || []).find((x) => x.id === finalScreenId)
    const payload =
      s?.action?.payload && typeof s.action.payload === 'object' && !Array.isArray(s.action.payload)
        ? (s.action.payload as any)
        : {}
    const sendDisabled = String(payload?.send_confirmation || '').toLowerCase() === 'false'
    const rawTitle = typeof payload?.confirmation_title === 'string' ? payload.confirmation_title : ''
    const rawFooter = typeof payload?.confirmation_footer === 'string' ? payload.confirmation_footer : ''
    const resolvedTitle = rawTitle ? resolveConfirmationBinding(rawTitle, s) : ''
    const resolvedFooter = rawFooter ? resolveConfirmationBinding(rawFooter, s) : ''
    // #region agent log
    // #endregion
    const fields = Array.isArray(payload?.confirmation_fields) ? (payload.confirmation_fields as any[]).filter((x) => typeof x === 'string') : null
    const labels =
      payload?.confirmation_labels && typeof payload.confirmation_labels === 'object' && !Array.isArray(payload.confirmation_labels)
        ? (payload.confirmation_labels as Record<string, string>)
        : null
    return { sendDisabled, title: resolvedTitle || rawTitle, footer: resolvedFooter || rawFooter, fields, labels }
  }, [finalScreenId, previewDynamicSpec, resolveConfirmationBinding])

  const applyConfirmationPatch = React.useCallback(
    (patch: { enabled?: boolean; title?: string; footer?: string; fields?: string[] | null; labels?: Record<string, string> | null }) => {
      if (!previewDynamicSpec || !finalScreenId) return
      const nextSpec: DynamicFlowSpecV1 = {
        ...(previewDynamicSpec as any),
        screens: (previewDynamicSpec.screens || []).map((s: any) => {
          if (s.id !== finalScreenId) return s
          const currentAction: any = s.action && typeof s.action === 'object' ? s.action : { type: 'complete', label: 'Concluir' }
          const basePayload =
            currentAction?.payload && typeof currentAction.payload === 'object' && !Array.isArray(currentAction.payload)
              ? { ...(currentAction.payload as Record<string, unknown>) }
              : {}

          if (patch.enabled !== undefined) {
            if (patch.enabled) delete (basePayload as any).send_confirmation
            else (basePayload as any).send_confirmation = 'false'
          }
          if (patch.title !== undefined) {
            const raw = String(patch.title || '')
            const v = raw
            const hasValue = raw.trim().length > 0
            // #region agent log
            // #endregion
            if (hasValue) (basePayload as any).confirmation_title = v
            else delete (basePayload as any).confirmation_title
          }
          if (patch.footer !== undefined) {
            const raw = String(patch.footer || '')
            const v = raw
            const hasValue = raw.trim().length > 0
            // #region agent log
            // #endregion
            if (hasValue) (basePayload as any).confirmation_footer = v
            else delete (basePayload as any).confirmation_footer
          }
          if (patch.fields !== undefined) {
            const list = Array.isArray(patch.fields) ? patch.fields.filter(Boolean) : []
            if (list.length) (basePayload as any).confirmation_fields = list
            else delete (basePayload as any).confirmation_fields
          }
          if (patch.labels !== undefined) {
            const labels = patch.labels && typeof patch.labels === 'object' ? patch.labels : {}
            const cleaned: Record<string, string> = {}
            for (const [k, v] of Object.entries(labels)) {
              const key = String(k || '').trim()
              const rawVal = String(v || '')
              const hasValue = rawVal.trim().length > 0
              if (key && hasValue) cleaned[key] = rawVal
            }
            // #region agent log
            // #endregion
            if (Object.keys(cleaned).length) (basePayload as any).confirmation_labels = cleaned
            else delete (basePayload as any).confirmation_labels
          }

          return { ...s, terminal: true, action: { ...currentAction, type: 'complete', payload: basePayload } }
        }),
      }

      const nextJson = generateDynamicFlowJson(nextSpec)
      setPreviewDynamicSpec(nextSpec)
      setFormPreviewJson(nextJson)
      controller.save({
        spec: { ...(controller.spec as any), dynamicFlow: nextSpec },
        flowJson: nextJson,
      })
    },
    [controller, finalScreenId, previewDynamicSpec],
  )

  const handleTemplateClick = React.useCallback((tpl: { flowJson: unknown; key: string; form?: any; isDynamic?: boolean }) => {
    // #region agent log
    // #endregion agent log
    if (hoverPreviewTimerRef.current) {
      // #region agent log
      // #endregion agent log
      clearTimeout(hoverPreviewTimerRef.current)
      hoverPreviewTimerRef.current = null
    }
    setSelectedTemplateKey(tpl.key)
    try {
      const nextJson = computeTemplatePreviewJson(tpl)
      // #region agent log
      // #endregion agent log
      setFormPreviewSelectedScreenId(null)
      setTemplateHoverPreviewJson(null)
      setHoverTemplateKey(null)
      setTemplateSelectedPreviewJson(nextJson)
    } catch {
      // ignore click preview errors
    }
  }, [computeTemplatePreviewJson])

  const handleTemplateListMouseLeave = React.useCallback(() => {
    if (hoverPreviewTimerRef.current) {
      clearTimeout(hoverPreviewTimerRef.current)
      hoverPreviewTimerRef.current = null
    }
    // #region agent log
    // #endregion agent log
    setTemplateHoverPreviewJson(null)
    setHoverTemplateKey(null)
  }, [])

  const handleStartModeSelect = React.useCallback((mode: 'ai' | 'template' | 'zero') => {
    // #region agent log
    // #endregion agent log
    setStartMode(mode)
    if (mode === 'zero') {
      setStep(2)
    }
  }, [])

  const handleCancelStartMode = React.useCallback(() => {
    setStartMode(null)
  }, [])

  const handleOpenAdvanced = React.useCallback(() => {
    // #region agent log
    // #endregion agent log
    setShowAdvancedPanel(true)
  }, [])

  const handleCloseAdvancedPanel = React.useCallback(() => {
    // #region agent log
    // #endregion agent log
    setShowAdvancedPanel(false)
  }, [])

  const handlePreviewScreenIdChange = React.useCallback((screenId: string | null) => {
    setFormPreviewSelectedScreenId(screenId)
  }, [])

  const handleEditorSave = React.useCallback((patch: { spec?: unknown; flowJson?: unknown }) => {
    controller.save({
      ...(patch.spec !== undefined ? { spec: patch.spec } : {}),
      ...(patch.flowJson !== undefined ? { flowJson: patch.flowJson } : {}),
    })
  }, [controller])

  const handleAdvancedScreensChange = React.useCallback((screens: any) => {
    const next = { ...(formPreviewJson as any), screens }
    setFormPreviewJson(next)
    const nextSpec = dynamicFlowSpecFromJson(next)
    controller.save({
      spec: { ...(controller.spec as any), dynamicFlow: nextSpec },
      flowJson: next,
    })
  }, [controller, formPreviewJson])

  const handleAdvancedRoutingChange = React.useCallback((routing: any) => {
    const next = { ...(formPreviewJson as any), routing_model: routing }
    setFormPreviewJson(next)
    const nextSpec = dynamicFlowSpecFromJson(next)
    controller.save({
      spec: { ...(controller.spec as any), dynamicFlow: nextSpec },
      flowJson: next,
    })
  }, [controller, formPreviewJson])

  const handleSaveDraft = React.useCallback(() => {
    controller.save({ name })
  }, [controller, name])

  const handleResetPublication = React.useCallback(async () => {
    await controller.saveAsync({ name, resetMeta: true })
    setMetaFlowId('')
    toast.success('Publicação resetada. O próximo envio cria um novo Flow na Meta.')
  }, [controller, name])

  const handlePublishToMeta = React.useCallback(async () => {
    const flowJsonToSave = formPreviewJson || (flow as any)?.flow_json

    await controller.saveAsync({
      name,
      ...(controller.spec ? { spec: controller.spec } : {}),
      ...(flowJsonToSave ? { flowJson: flowJsonToSave } : {}),
    })

    const updated = await controller.publishToMetaAsync({
      publish: true,
      categories: ['OTHER'],
      updateIfExists: true,
    })

    setMetaFlowId(updated.meta_flow_id || '')
    toast.success('MiniApp publicada na Meta com sucesso!')
    router.push('/templates?tab=flows')
  }, [controller, flow, formPreviewJson, name, router])

  const handleSelectPreviewEditorKey = React.useCallback((key: string | null) => {
    // #region agent log
    // #endregion
    setPreviewSelectedEditorKey(key)
  }, [])

  const panelClass = 'rounded-2xl border border-white/10 bg-zinc-900/60 shadow-[0_12px_30px_rgba(0,0,0,0.35)]'

  return {
    // controller passthrough
    controller,
    flow,
    router,

    // state
    name,
    setName,
    metaFlowId,
    step,
    setStep,
    formPreviewJson,
    formPreviewSelectedScreenId,
    previewSelectedEditorKey,
    previewDynamicSpec,
    editorSpecOverride,
    startMode,
    aiPrompt,
    setAiPrompt,
    aiLoading,
    selectedTemplateKey,
    hoverTemplateKey,
    showAdvancedPanel,

    // derived
    advancedGate,
    shouldShowLoading,
    metaStatus,
    hasMetaErrors,
    statusLabel,
    statusClass,
    steps,
    previewFlowJson,
    finalScreenId,
    confirmationState,
    panelClass,

    // handlers
    handleEditorPreviewChange,
    handleGenerateWithAI,
    handleApplyTemplate,
    handleTemplateHover,
    handleTemplateClick,
    handleTemplateListMouseLeave,
    handleStartModeSelect,
    handleCancelStartMode,
    handleOpenAdvanced,
    handleCloseAdvancedPanel,
    handlePreviewScreenIdChange,
    handleEditorSave,
    handleAdvancedScreensChange,
    handleAdvancedRoutingChange,
    handleSaveDraft,
    handleResetPublication,
    handlePublishToMeta,
    handleSelectPreviewEditorKey,
    applyConfirmationPatch,
    collectFieldCatalog,
  }
}
