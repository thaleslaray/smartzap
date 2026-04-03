type CustomFieldLabelByKey = Record<string, string>;

export type ContactFixTarget =
  | { type: 'name' }
  | { type: 'email' }
  | { type: 'custom_field'; key: string };

export type ContactFixFocus =
  | ContactFixTarget
  | { type: 'multi'; targets: ContactFixTarget[] }
  | null;

export type HumanizedReason = {
  title: string;
  details?: string;
  focus?: ContactFixFocus;
};

const SYSTEM_TOKEN_LABELS: Record<string, { label: string; focus: ContactFixTarget | null }> = {
  // Nome
  nome: { label: 'Nome', focus: { type: 'name' } },
  name: { label: 'Nome', focus: { type: 'name' } },
  'contact.name': { label: 'Nome', focus: { type: 'name' } },
  'contact_name': { label: 'Nome', focus: { type: 'name' } },

  // Telefone (não “corrigível” via modal hoje — mantemos apenas informativo)
  telefone: { label: 'Telefone', focus: null },
  phone: { label: 'Telefone', focus: null },
  'contact.phone': { label: 'Telefone', focus: null },
  'contact_phone': { label: 'Telefone', focus: null },

  // Email
  email: { label: 'Email', focus: { type: 'email' } },
  'contact.email': { label: 'Email', focus: { type: 'email' } },
  'contact_email': { label: 'Email', focus: { type: 'email' } },
};

function extractSingleToken(raw: string): string | null {
  const s = (raw || '').trim();
  // Suporta tokens internos do SmartZap com pontos (ex.: {{contact.name}})
  const m = s.match(/^\{\{([\w\d_.]+)\}\}$/);
  return m ? m[1] : null;
}

function normalizeWhere(where: string): string {
  if (where === 'header') return 'Cabeçalho';
  if (where === 'body') return 'Corpo';
  if (where === 'button') return 'Botão';
  return 'Template';
}

export function humanizeVarSource(
  raw: string,
  customFieldLabelByKey?: CustomFieldLabelByKey
): { label: string; focus?: ContactFixTarget | null } {
  const token = extractSingleToken(raw);
  if (!token) {
    if (!raw || raw === '<vazio>') {
      return { label: 'Valor não preenchido' };
    }
    return { label: 'Valor não disponível' };
  }

  const sys = SYSTEM_TOKEN_LABELS[token.toLowerCase()];
  if (sys) return { label: sys.label, focus: sys.focus };

  const customLabel = customFieldLabelByKey?.[token];
  return {
    label: customLabel ? `Campo: ${customLabel}` : `Campo: ${token}`,
    focus: { type: 'custom_field', key: token },
  };
}

function dedupeTargets(targets: ContactFixTarget[]): ContactFixTarget[] {
  const seen = new Set<string>();
  const out: ContactFixTarget[] = [];
  for (const t of targets) {
    const id =
      t.type === 'email'
        ? 'email'
        : t.type === 'name'
          ? 'name'
          : `custom_field:${t.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(t);
  }
  return out;
}

function focusFromTargets(targets: ContactFixTarget[]): ContactFixFocus {
  const uniq = dedupeTargets(targets);
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];
  return { type: 'multi', targets: uniq };
}

export function humanizePrecheckReason(
  reason: string,
  options?: { customFieldLabelByKey?: CustomFieldLabelByKey }
): HumanizedReason {
  const text = String(reason || '').trim();
  if (!text) return { title: '-' };

  // Caso principal: variáveis faltantes (pré-check/template contract)
  if (text.includes('Variáveis obrigatórias sem valor:')) {
    const tail = text.split('Variáveis obrigatórias sem valor:')[1] || '';
    const parts = tail.split(',').map(s => s.trim()).filter(Boolean);

    // Coleta alvos de correção (pode haver mais de um campo faltando).
    const targets: ContactFixTarget[] = [];

    // Tenta achar o primeiro raw="{{...}}" para montar o título/detalhe.
    let firstRaw: string | null = null;
    let firstWhere: string | null = null;
    let firstKey: string | null = null;
    let firstButtonIndex: number | null = null;

    for (const p of parts) {
      const btn = p.match(/^button:(\d+):(\w+) \(raw="([\s\S]*?)"\)$/);
      if (btn) {
        firstWhere = 'button';
        firstButtonIndex = Number(btn[1]);
        firstKey = btn[2];
        firstRaw = btn[3];
        const inf = humanizeVarSource(firstRaw || '<vazio>', options?.customFieldLabelByKey);
        if (inf.focus) targets.push(inf.focus);
        break;
      }
      const hb = p.match(/^(header|body):(\w+) \(raw="([\s\S]*?)"\)$/);
      if (hb) {
        firstWhere = hb[1];
        firstKey = hb[2];
        firstRaw = hb[3];
        const inf = humanizeVarSource(firstRaw || '<vazio>', options?.customFieldLabelByKey);
        if (inf.focus) targets.push(inf.focus);
        break;
      }
    }

    // Também tenta inferir todos os alvos (mesmo que o primeiro não tenha sido inferível).
    for (const p of parts) {
      const btn = p.match(/^button:(\d+):(\w+) \(raw="([\s\S]*?)"\)$/);
      if (btn) {
        const raw = btn[3];
        const inf = humanizeVarSource(raw || '<vazio>', options?.customFieldLabelByKey);
        if (inf.focus) targets.push(inf.focus);
        continue;
      }
      const hb = p.match(/^(header|body):(\w+) \(raw="([\s\S]*?)"\)$/);
      if (hb) {
        const raw = hb[3];
        const inf = humanizeVarSource(raw || '<vazio>', options?.customFieldLabelByKey);
        if (inf.focus) targets.push(inf.focus);
      }
    }

    const inferred = humanizeVarSource(firstRaw || '<vazio>', options?.customFieldLabelByKey);

    // Se não deu pra inferir o token, ao menos mostra qual variável do template.
    const title = inferred.label.startsWith('Valor')
      ? `Precisa de: {{${firstKey || '?' }}}`
      : `Precisa de: ${inferred.label}`;

    const whereLabel = firstWhere ? normalizeWhere(firstWhere) : undefined;
    const details = whereLabel
      ? (firstWhere === 'button' && firstButtonIndex != null
        ? `${whereLabel} ${firstButtonIndex + 1} • variável {{${firstKey || '?' }}}`
        : `${whereLabel} • variável {{${firstKey || '?' }}}`)
      : undefined;

    return {
      title,
      details,
      focus: focusFromTargets(targets) || inferred.focus || null,
    };
  }

  // Outros motivos comuns (mantém simples/curto)
  if (text.toLowerCase().includes('telefone') && text.toLowerCase().includes('invál')) {
    return { title: 'Telefone inválido' };
  }

  // IMPORTANTE: verificar supressão ANTES de opt-out, pois a razão de supressão
  // pode conter "opt-out" no texto explicativo (ex: "Usuário solicitou opt-out via mensagem inbound")
  if (text.toLowerCase().includes('suprimido') || text.toLowerCase().includes('suppressed')) {
    return { title: 'Telefone suprimido globalmente' };
  }

  if (text.toLowerCase().includes('opt-out') || text.toLowerCase().includes('opt out')) {
    return { title: 'Contato opt-out (não quer receber mensagens)' };
  }

  return { title: text };
}
