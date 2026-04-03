/**
 * Testes para o State Machine do Installer
 *
 * Testa:
 * - Transições válidas
 * - Guards que bloqueiam transições inválidas
 * - Validação de dados antes de NEXT
 * - Type guards
 */

import { describe, it, expect } from 'vitest';
import {
  installReducer,
  initialState,
  createInitialState,
  isCollecting,
  isProvisioning,
  isError,
  isSuccess,
} from '../machine';
import type { InstallState, InstallAction, InstallData } from '../types';
import { EMPTY_INSTALL_DATA, isValidEmail, normalizeToken, stepValidators, SCHEMA_VERSION } from '../types';

// =============================================================================
// HELPERS
// =============================================================================

const validStep1Data: Partial<InstallData> = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'password123',
};

const validStep2Data: Partial<InstallData> = {
  ...validStep1Data,
  vercelToken: 'vercel_token_123',
};

const validStep3Data: Partial<InstallData> = {
  ...validStep2Data,
  supabasePat: 'supabase_pat_123',
};

const validStep4Data: Partial<InstallData> = {
  ...validStep3Data,
  qstashToken: 'qstash_token_123',
};

const validAllData: InstallData = {
  ...EMPTY_INSTALL_DATA,
  ...validStep4Data,
  redisRestUrl: 'https://my-redis.upstash.io',
  redisRestToken: 'redis_test_token_1234567890_abcdef01',
};

function dispatch(state: InstallState, action: InstallAction): InstallState {
  return installReducer(state, action);
}

// =============================================================================
// INITIAL STATE
// =============================================================================

describe('Initial State', () => {
  it('should start in collecting phase at step 1', () => {
    expect(initialState.phase).toBe('collecting');
    expect(isCollecting(initialState)).toBe(true);
    if (isCollecting(initialState)) {
      expect(initialState.step).toBe(1);
    }
  });

  it('should have empty data by default', () => {
    expect(isCollecting(initialState)).toBe(true);
    if (isCollecting(initialState)) {
      expect(initialState.data.name).toBe('');
      expect(initialState.data.email).toBe('');
    }
  });

  it('should allow initial data via createInitialState', () => {
    const state = createInitialState({ name: 'Pre-filled' });
    expect(isCollecting(state)).toBe(true);
    if (isCollecting(state)) {
      expect(state.data.name).toBe('Pre-filled');
    }
  });
});

// =============================================================================
// NAVIGATION - NEXT
// =============================================================================

describe('NEXT Action', () => {
  it('should NOT advance if step data is incomplete', () => {
    const state = initialState; // step 1, no data
    const next = dispatch(state, { type: 'NEXT' });

    // Should stay at step 1
    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
    }
  });

  it('should advance to step 2 when step 1 data is valid', () => {
    const state = createInitialState(validStep1Data);
    const next = dispatch(state, { type: 'NEXT' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(2);
      expect(next.direction).toBe(1);
    }
  });

  it('should go to provisioning from step 5 with all valid data', () => {
    let state = createInitialState(validAllData);
    // Navigate to step 5
    if (isCollecting(state)) {
      state = { ...state, step: 5 };
    }

    const next = dispatch(state, { type: 'NEXT' });

    expect(isProvisioning(next)).toBe(true);
    if (isProvisioning(next)) {
      expect(next.progress).toBe(0);
      expect(next.title).toBe('Iniciando...');
    }
  });

  it('should NOT work from non-collecting phases', () => {
    const provisioningState: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };

    const next = dispatch(provisioningState, { type: 'NEXT' });
    expect(next).toBe(provisioningState); // Unchanged
  });
});

// =============================================================================
// NAVIGATION - BACK
// =============================================================================

describe('BACK Action', () => {
  it('should NOT go back from step 1', () => {
    const state = initialState;
    const next = dispatch(state, { type: 'BACK' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
    }
  });

  it('should go back from step 2 to step 1', () => {
    let state = createInitialState(validStep1Data);
    state = dispatch(state, { type: 'NEXT' }); // Go to step 2

    const next = dispatch(state, { type: 'BACK' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
      expect(next.direction).toBe(-1);
    }
  });

  it('should preserve data when going back', () => {
    let state = createInitialState(validStep1Data);
    state = dispatch(state, { type: 'NEXT' }); // Go to step 2

    const next = dispatch(state, { type: 'BACK' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.data.name).toBe('Test User');
    }
  });
});

// =============================================================================
// UPDATE_DATA
// =============================================================================

describe('UPDATE_DATA Action', () => {
  it('should update data in collecting phase', () => {
    const state = initialState;
    const next = dispatch(state, {
      type: 'UPDATE_DATA',
      data: { name: 'New Name' },
    });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.data.name).toBe('New Name');
      expect(next.data.email).toBe(''); // Other fields unchanged
    }
  });

  it('should merge data, not replace', () => {
    const state = createInitialState({ name: 'Original' });
    const next = dispatch(state, {
      type: 'UPDATE_DATA',
      data: { email: 'new@email.com' },
    });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.data.name).toBe('Original'); // Preserved
      expect(next.data.email).toBe('new@email.com'); // Updated
    }
  });

  it('should NOT work in provisioning phase', () => {
    const provisioningState: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };

    const next = dispatch(provisioningState, {
      type: 'UPDATE_DATA',
      data: { name: 'Hacked' },
    });

    expect(isProvisioning(next)).toBe(true);
    if (isProvisioning(next)) {
      expect(next.data.name).toBe('Test User'); // Unchanged
    }
  });
});

// =============================================================================
// PROVISIONING
// =============================================================================

describe('PROGRESS Action', () => {
  it('should update progress in provisioning phase', () => {
    const state: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 0,
      title: 'Starting',
      subtitle: 'Please wait',
    };

    const next = dispatch(state, {
      type: 'PROGRESS',
      progress: 50,
      title: 'Deploying',
      subtitle: 'Creating resources',
    });

    expect(isProvisioning(next)).toBe(true);
    if (isProvisioning(next)) {
      expect(next.progress).toBe(50);
      expect(next.title).toBe('Deploying');
      expect(next.subtitle).toBe('Creating resources');
    }
  });

  it('should NOT work in collecting phase', () => {
    const state = initialState;
    const next = dispatch(state, {
      type: 'PROGRESS',
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    });

    expect(isCollecting(next)).toBe(true); // Unchanged
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

describe('ERROR Action', () => {
  it('should transition to error state from provisioning', () => {
    const state: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };

    const next = dispatch(state, {
      type: 'ERROR',
      error: 'Something went wrong',
      returnToStep: 3,
      errorDetails: 'Supabase connection failed',
    });

    expect(isError(next)).toBe(true);
    if (isError(next)) {
      expect(next.error).toBe('Something went wrong');
      expect(next.returnToStep).toBe(3);
      expect(next.errorDetails).toBe('Supabase connection failed');
      expect(next.data).toBe(validAllData); // Data preserved
    }
  });

  it('should allow error from any phase', () => {
    const state = initialState;

    const next = dispatch(state, {
      type: 'ERROR',
      error: 'Network error',
      returnToStep: 1,
    });

    expect(isError(next)).toBe(true);
  });
});

// =============================================================================
// ERROR RECOVERY
// =============================================================================

describe('RETRY Action', () => {
  it('should return to collecting phase from error', () => {
    const state: InstallState = {
      phase: 'error',
      data: validAllData,
      returnToStep: 3,
      error: 'Test error',
    };

    const next = dispatch(state, { type: 'RETRY' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(3);
      expect(next.data).toBe(validAllData); // Data preserved
    }
  });

  it('should NOT work from non-error phase', () => {
    const state = initialState;
    const next = dispatch(state, { type: 'RETRY' });

    expect(next).toBe(state); // Unchanged
  });
});

// =============================================================================
// COMPLETE
// =============================================================================

describe('COMPLETE Action', () => {
  it('should transition to success from provisioning', () => {
    const state: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 100,
      title: 'Done',
      subtitle: 'All set',
    };

    const next = dispatch(state, { type: 'COMPLETE' });

    expect(isSuccess(next)).toBe(true);
    if (isSuccess(next)) {
      expect(next.data).toBe(validAllData); // Data preserved
    }
  });

  it('should NOT work from non-provisioning phase', () => {
    const state = initialState;
    const next = dispatch(state, { type: 'COMPLETE' });

    expect(next).toBe(state); // Unchanged
  });
});

// =============================================================================
// TYPE GUARDS
// =============================================================================

describe('Type Guards', () => {
  it('isCollecting should correctly narrow type', () => {
    const state = initialState;
    if (isCollecting(state)) {
      // TypeScript should allow accessing step and data
      expect(state.step).toBe(1);
      expect(state.data).toBeDefined();
    }
  });

  it('isProvisioning should correctly narrow type', () => {
    const state: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };
    if (isProvisioning(state)) {
      // TypeScript should allow accessing progress, title, subtitle
      expect(state.progress).toBe(50);
      expect(state.title).toBe('Test');
    }
  });

  it('isError should correctly narrow type', () => {
    const state: InstallState = {
      phase: 'error',
      data: validAllData,
      returnToStep: 2,
      error: 'Test error',
    };
    if (isError(state)) {
      // TypeScript should allow accessing error and returnToStep
      expect(state.error).toBe('Test error');
      expect(state.returnToStep).toBe(2);
    }
  });
});

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

describe('Email Validation', () => {
  it('should accept valid emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.co')).toBe(true);
    expect(isValidEmail('user+tag@example.org')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
    expect(isValidEmail('no@spaces .com')).toBe(false);
  });

  it('should block NEXT with invalid email', () => {
    const stateWithInvalidEmail = createInitialState({
      name: 'Test',
      email: 'not-an-email',
      password: 'password123',
    });

    const next = dispatch(stateWithInvalidEmail, { type: 'NEXT' });

    // Should stay at step 1
    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
    }
  });
});

// =============================================================================
// TOKEN NORMALIZATION
// =============================================================================

describe('normalizeToken', () => {
  it('should strip leading/trailing whitespace', () => {
    expect(normalizeToken('  abc  ')).toBe('abc');
  });

  it('should strip double quotes', () => {
    expect(normalizeToken('"eyJhbGciOiJSUzI1NiJ9"')).toBe('eyJhbGciOiJSUzI1NiJ9');
    expect(normalizeToken('"sbp_token"')).toBe('sbp_token');
  });

  it('should strip single quotes', () => {
    expect(normalizeToken("'qstash_token'")).toBe('qstash_token');
  });

  it('should strip backtick quotes', () => {
    expect(normalizeToken('`AEIMAHitoken`')).toBe('AEIMAHitoken');
  });

  it('should strip quotes AND whitespace together', () => {
    // Caso real: aluno copia da linha do .env com espaço depois das aspas
    expect(normalizeToken('  "eyJhbGci"  ')).toBe('eyJhbGci');
  });

  it('should not strip quotes in the middle of a token', () => {
    // Tokens reais nunca têm aspas no meio — mas garantir que não quebramos
    expect(normalizeToken('"abc"def"')).toBe('abc"def');
  });

  it('should allow step 5 validator to pass with quoted token', () => {
    // Regressão: aluno cola '"AEIMAHiXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"' do .env
    const data = {
      ...EMPTY_INSTALL_DATA,
      redisRestUrl: 'https://my-redis.upstash.io',
      redisRestToken: '"redis_test_token_1234567890_abcdef01"',
    };
    // stepValidators[5] usa normalizeToken internamente
    expect(stepValidators[5](data)).toBe(true);
  });
});

// =============================================================================
// GO_TO_STEP DIRECTION
// =============================================================================

describe('GO_TO_STEP Direction', () => {
  it('should set direction 1 when going forward', () => {
    const state = createInitialState(validStep1Data);
    const next = dispatch(state, { type: 'GO_TO_STEP', step: 3 });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(3);
      expect(next.direction).toBe(1);
    }
  });

  it('should set direction -1 when going backward', () => {
    let state = createInitialState(validAllData);
    if (isCollecting(state)) {
      state = { ...state, step: 4 };
    }

    const next = dispatch(state, { type: 'GO_TO_STEP', step: 2 });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(2);
      expect(next.direction).toBe(-1);
    }
  });

  it('should set direction 1 when coming from error state', () => {
    const errorState: InstallState = {
      phase: 'error',
      data: validAllData,
      returnToStep: 3,
      error: 'Test error',
    };

    const next = dispatch(errorState, { type: 'GO_TO_STEP', step: 3 });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.direction).toBe(1); // Default forward from error
    }
  });
});

// =============================================================================
// SUBMIT_STEP - ATOMIC ACTION
// =============================================================================

describe('SUBMIT_STEP Action', () => {
  it('should update data AND advance in a single action', () => {
    const state = initialState;
    const next = dispatch(state, {
      type: 'SUBMIT_STEP',
      data: validStep1Data,
    });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(2);
      expect(next.data.name).toBe('Test User');
      expect(next.data.email).toBe('test@example.com');
      expect(next.direction).toBe(1);
    }
  });

  it('should NOT advance if submitted data is invalid', () => {
    const state = initialState;
    const next = dispatch(state, {
      type: 'SUBMIT_STEP',
      data: { name: 'Test' }, // Missing email and password
    });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1); // Should stay at step 1
      expect(next.data.name).toBe('Test'); // But data should be updated
    }
  });

  it('should go to provisioning from step 5 with valid data', () => {
    let state = createInitialState(validStep4Data);
    if (isCollecting(state)) {
      state = { ...state, step: 5 };
    }

    const next = dispatch(state, {
      type: 'SUBMIT_STEP',
      data: {
        redisRestUrl: 'https://my-redis.upstash.io',
        redisRestToken: 'redis_test_token_1234567890_abcdef01',
      },
    });

    expect(isProvisioning(next)).toBe(true);
  });

  it('should NOT work from non-collecting phases', () => {
    const provisioningState: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };

    const next = dispatch(provisioningState, {
      type: 'SUBMIT_STEP',
      data: { name: 'Hacked' },
    });

    expect(next).toBe(provisioningState); // Unchanged
  });
});

// =============================================================================
// RESET ACTION
// =============================================================================

describe('RESET Action', () => {
  it('should reset to initial state from any phase', () => {
    const provisioningState: InstallState = {
      phase: 'provisioning',
      data: validAllData,
      progress: 50,
      title: 'Test',
      subtitle: 'Test',
    };

    const next = dispatch(provisioningState, { type: 'RESET' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
      expect(next.data.name).toBe(''); // Data should be empty
    }
  });

  it('should reset from error state', () => {
    const errorState: InstallState = {
      phase: 'error',
      data: validAllData,
      returnToStep: 3,
      error: 'Test error',
    };

    const next = dispatch(errorState, { type: 'RESET' });

    expect(isCollecting(next)).toBe(true);
    if (isCollecting(next)) {
      expect(next.step).toBe(1);
    }
  });
});

// =============================================================================
// SCHEMA VERSIONING
// =============================================================================

describe('Schema Versioning', () => {
  it('should have a defined SCHEMA_VERSION', () => {
    expect(SCHEMA_VERSION).toBeDefined();
    expect(typeof SCHEMA_VERSION).toBe('number');
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
