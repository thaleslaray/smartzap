/**
 * State Machine MELHORADO para o fluxo de instalação.
 *
 * Melhorias implementadas:
 * 1. Data integrado ao state (não mais separado)
 * 2. Validação antes de NEXT
 * 3. Exhaustive type checking ativo
 * 4. Default case que loga warning
 * 5. Direction integrado ao state
 * 6. Schema versioning para hydration segura
 * 7. Logs condicionais (só em dev)
 */

import type {
  InstallState,
  InstallAction,
  InstallStep,
  InstallData,
  InstallErrorType,
} from './types';
import { EMPTY_INSTALL_DATA, stepValidators, assertNever, DEBUG, SCHEMA_VERSION } from './types';

// =============================================================================
// HELPERS
// =============================================================================

/** Log condicional - só aparece em development */
function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.warn(message, ...args);
  }
}

/** Calcula a direção da animação baseado nos steps */
function calculateDirection(fromStep: InstallStep | null, toStep: InstallStep): 1 | -1 {
  if (fromStep === null) return 1;
  if (fromStep === toStep) return 1; // Mesmo step = mantém direção forward
  return toStep > fromStep ? 1 : -1;
}

// =============================================================================
// INITIAL STATE - AGORA COM DATA INTEGRADO
// =============================================================================

export function createInitialState(initialData?: Partial<InstallData>): InstallState {
  return {
    phase: 'collecting',
    step: 1,
    data: { ...EMPTY_INSTALL_DATA, ...initialData },
    direction: 1,
  };
}

export const initialState: InstallState = createInitialState();

// =============================================================================
// REDUCER - MELHORADO
// =============================================================================

export function installReducer(state: InstallState, action: InstallAction): InstallState {
  switch (action.type) {
    // -------------------------------------------------------------------------
    // DATA UPDATE (NOVO)
    // -------------------------------------------------------------------------

    case 'UPDATE_DATA': {
      // Só atualiza data na fase de collecting
      if (state.phase !== 'collecting') {
        debugLog('[Installer] UPDATE_DATA ignorado - não está em collecting');
        return state;
      }

      return {
        ...state,
        data: { ...state.data, ...action.data },
      };
    }

    // -------------------------------------------------------------------------
    // SUBMIT_STEP - ATÔMICO (corrige race condition)
    // -------------------------------------------------------------------------

    case 'SUBMIT_STEP': {
      if (state.phase !== 'collecting') {
        debugLog('[Installer] SUBMIT_STEP ignorado - não está em collecting');
        return state;
      }

      // Merge dos novos dados com os existentes
      const mergedData = { ...state.data, ...action.data };

      // Valida dados do step atual
      const isStepValid = stepValidators[state.step](mergedData);
      if (!isStepValid) {
        debugLog(`[Installer] SUBMIT_STEP bloqueado - step ${state.step} não está completo`);
        // Retorna com dados atualizados mas sem avançar (permite mostrar erro)
        return {
          ...state,
          data: mergedData,
        };
      }

      // Step 5 → Start provisioning
      if (state.step === 5) {
        return {
          phase: 'provisioning',
          data: mergedData,
          progress: 0,
          title: 'Iniciando...',
          subtitle: 'Preparando ambiente',
        };
      }

      // Avança para próximo step
      return {
        ...state,
        data: mergedData,
        step: (state.step + 1) as InstallStep,
        direction: 1,
      };
    }

    // -------------------------------------------------------------------------
    // NAVIGATION
    // -------------------------------------------------------------------------

    case 'NEXT': {
      if (state.phase !== 'collecting') {
        debugLog('[Installer] NEXT ignorado - não está em collecting');
        return state;
      }

      // ✅ MELHORIA: Valida dados do step atual antes de avançar
      const isStepValid = stepValidators[state.step](state.data);
      if (!isStepValid) {
        debugLog(`[Installer] NEXT bloqueado - step ${state.step} não está completo`);
        return state; // Bloqueia navegação se dados incompletos
      }

      // Step 5 → Start provisioning
      if (state.step === 5) {
        return {
          phase: 'provisioning',
          data: state.data,
          progress: 0,
          title: 'Iniciando...',
          subtitle: 'Preparando ambiente',
        };
      }

      // Go to next step
      return {
        ...state,
        step: (state.step + 1) as InstallStep,
        direction: 1,
      };
    }

    case 'BACK': {
      if (state.phase !== 'collecting') {
        debugLog('[Installer] BACK ignorado - não está em collecting');
        return state;
      }
      if (state.step === 1) {
        debugLog('[Installer] BACK ignorado - já está no step 1');
        return state;
      }

      return {
        ...state,
        step: (state.step - 1) as InstallStep,
        direction: -1,
      };
    }

    case 'GO_TO_STEP': {
      if (state.phase !== 'collecting' && state.phase !== 'error') {
        debugLog('[Installer] GO_TO_STEP ignorado - fase não permite');
        return state;
      }

      // Calcula direção baseado no step atual (error não tem step, assume 1)
      const fromStep = state.phase === 'collecting' ? state.step : null;

      return {
        phase: 'collecting',
        step: action.step,
        data: state.data,
        direction: calculateDirection(fromStep, action.step),
      };
    }

    // -------------------------------------------------------------------------
    // PROVISIONING
    // -------------------------------------------------------------------------

    case 'START_PROVISIONING': {
      if (state.phase !== 'collecting' || state.step !== 5) {
        debugLog('[Installer] START_PROVISIONING ignorado - condições não satisfeitas');
        return state;
      }

      // Valida TODOS os steps antes de provisionar
      for (let step = 1; step <= 5; step++) {
        if (!stepValidators[step as InstallStep](state.data)) {
          debugLog(`[Installer] START_PROVISIONING bloqueado - step ${step} inválido`);
          return state;
        }
      }

      return {
        phase: 'provisioning',
        data: state.data,
        progress: 0,
        title: 'Iniciando...',
        subtitle: 'Preparando ambiente',
      };
    }

    case 'PROGRESS': {
      if (state.phase !== 'provisioning') {
        debugLog('[Installer] PROGRESS ignorado - não está em provisioning');
        return state;
      }

      return {
        ...state,
        progress: action.progress,
        title: action.title,
        subtitle: action.subtitle,
      };
    }

    case 'ERROR': {
      // ERROR pode acontecer de qualquer fase (ex: erro de rede no collecting)
      return {
        phase: 'error',
        data: 'data' in state ? state.data : EMPTY_INSTALL_DATA,
        returnToStep: action.returnToStep,
        error: action.error,
        errorType: action.errorType,
        errorDetails: action.errorDetails,
      };
    }

    case 'COMPLETE': {
      if (state.phase !== 'provisioning') {
        debugLog('[Installer] COMPLETE ignorado - não está em provisioning');
        return state;
      }

      return {
        phase: 'success',
        data: state.data,
      };
    }

    // -------------------------------------------------------------------------
    // ERROR RECOVERY
    // -------------------------------------------------------------------------

    case 'RETRY': {
      if (state.phase !== 'error') {
        debugLog('[Installer] RETRY ignorado - não está em error');
        return state;
      }

      return {
        phase: 'collecting',
        step: state.returnToStep,
        data: state.data,
        direction: -1,
      };
    }

    case 'RESET': {
      // Critical #2: Permite recomeçar do zero (limpa dados e volta ao step 1)
      debugLog('[Installer] RESET - recomeçando instalação');
      clearPersistedState();
      return createInitialState();
    }

    // -------------------------------------------------------------------------
    // EXHAUSTIVE CHECK (MELHORIA #4) - ATIVO
    // -------------------------------------------------------------------------

    default: {
      // ✅ TypeScript vai reclamar aqui se faltar um case
      // O código abaixo faz o check em compile time mas é seguro em runtime
      const _exhaustiveCheck: never = action;
      debugLog('[Installer] Action desconhecida:', (_exhaustiveCheck as { type: string }).type);
      return state;
    }
  }
}

// =============================================================================
// TYPE GUARDS (sem mudanças, mas agora tipagem mais forte)
// =============================================================================

export function isCollecting(state: InstallState): state is {
  phase: 'collecting';
  step: InstallStep;
  data: InstallData;
  direction: 1 | -1;
} {
  return state.phase === 'collecting';
}

export function isProvisioning(state: InstallState): state is {
  phase: 'provisioning';
  data: InstallData;
  progress: number;
  title: string;
  subtitle: string;
} {
  return state.phase === 'provisioning';
}

export function isError(state: InstallState): state is {
  phase: 'error';
  data: InstallData;
  returnToStep: InstallStep;
  error: string;
  errorType?: InstallErrorType;
  errorDetails?: string;
} {
  return state.phase === 'error';
}

export function isSuccess(state: InstallState): state is {
  phase: 'success';
  data: InstallData;
} {
  return state.phase === 'success';
}

// =============================================================================
// PERSISTÊNCIA (COM SCHEMA VERSIONING)
// =============================================================================

const STORAGE_KEY = 'smartzap_install_state';

/** Estrutura persistida no localStorage (inclui versão) */
interface PersistedState {
  version: number;
  state: InstallState;
}

/** Salva estado no localStorage com versão do schema */
export function persistState(state: InstallState): void {
  try {
    // Não persiste fase de provisioning (não pode ser retomada)
    if (state.phase === 'provisioning') return;

    const payload: PersistedState = {
      version: SCHEMA_VERSION,
      state,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage pode não estar disponível
  }
}

/** Recupera estado do localStorage (com verificação de versão) */
export function hydrateState(): InstallState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const payload = JSON.parse(saved) as PersistedState | InstallState;

    // Migração: estado antigo sem versão
    if (!('version' in payload)) {
      debugLog('[Installer] Estado antigo sem versão detectado, descartando');
      clearPersistedState();
      return null;
    }

    // Verifica compatibilidade de versão
    if (payload.version !== SCHEMA_VERSION) {
      debugLog(`[Installer] Schema version mismatch: expected ${SCHEMA_VERSION}, got ${payload.version}`);
      clearPersistedState();
      return null;
    }

    const state = payload.state;

    // Valida estrutura básica do estado
    if (!state.phase || !('data' in state)) {
      debugLog('[Installer] Estado inválido detectado, descartando');
      clearPersistedState();
      return null;
    }

    debugLog('[Installer] Estado recuperado com sucesso (v' + payload.version + ')');
    return state;
  } catch {
    return null;
  }
}

/** Limpa estado persistido */
export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignora erros
  }
}
