import { describe, it, expect } from 'vitest';
import {
  humanizeVarSource,
  humanizePrecheckReason,
  type ContactFixTarget,
  type HumanizedReason,
} from './precheck-humanizer';

describe('precheck-humanizer', () => {
  describe('humanizeVarSource', () => {
    describe('system tokens - name variants', () => {
      it.each([
        ['{{nome}}', 'Nome', { type: 'name' }],
        ['{{name}}', 'Nome', { type: 'name' }],
        ['{{contact.name}}', 'Nome', { type: 'name' }],
        ['{{contact_name}}', 'Nome', { type: 'name' }],
        ['{{NOME}}', 'Nome', { type: 'name' }], // case insensitive
        ['{{NAME}}', 'Nome', { type: 'name' }],
      ] as const)('should return label "%s" -> "%s"', (raw, expectedLabel, expectedFocus) => {
        const result = humanizeVarSource(raw);
        expect(result.label).toBe(expectedLabel);
        expect(result.focus).toEqual(expectedFocus);
      });
    });

    describe('system tokens - phone variants', () => {
      it.each([
        ['{{telefone}}', 'Telefone', null],
        ['{{phone}}', 'Telefone', null],
        ['{{contact.phone}}', 'Telefone', null],
        ['{{contact_phone}}', 'Telefone', null],
      ] as const)('should return label "%s" -> "%s" with null focus', (raw, expectedLabel, expectedFocus) => {
        const result = humanizeVarSource(raw);
        expect(result.label).toBe(expectedLabel);
        expect(result.focus).toBe(expectedFocus);
      });
    });

    describe('system tokens - email variants', () => {
      it.each([
        ['{{email}}', 'Email', { type: 'email' }],
        ['{{contact.email}}', 'Email', { type: 'email' }],
        ['{{contact_email}}', 'Email', { type: 'email' }],
      ] as const)('should return label "%s" -> "%s"', (raw, expectedLabel, expectedFocus) => {
        const result = humanizeVarSource(raw);
        expect(result.label).toBe(expectedLabel);
        expect(result.focus).toEqual(expectedFocus);
      });
    });

    describe('custom fields', () => {
      it('should return custom field with key when no label provided', () => {
        const result = humanizeVarSource('{{custom_field_123}}');
        expect(result.label).toBe('Campo: custom_field_123');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom_field_123' });
      });

      it('should return custom field with provided label', () => {
        const result = humanizeVarSource('{{company_name}}', { company_name: 'Nome da Empresa' });
        expect(result.label).toBe('Campo: Nome da Empresa');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'company_name' });
      });

      it('should use key as label when custom field not in map', () => {
        const result = humanizeVarSource('{{unknown_field}}', { other_field: 'Outro Campo' });
        expect(result.label).toBe('Campo: unknown_field');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'unknown_field' });
      });
    });

    describe('edge cases - empty/invalid values', () => {
      it('should return "Valor não preenchido" for empty string', () => {
        const result = humanizeVarSource('');
        expect(result.label).toBe('Valor não preenchido');
        expect(result.focus).toBeUndefined();
      });

      it('should return "Valor não preenchido" for <vazio>', () => {
        const result = humanizeVarSource('<vazio>');
        expect(result.label).toBe('Valor não preenchido');
        expect(result.focus).toBeUndefined();
      });

      it('should return "Valor não disponível" for non-token string', () => {
        const result = humanizeVarSource('some random text');
        expect(result.label).toBe('Valor não disponível');
        expect(result.focus).toBeUndefined();
      });

      it('should return "Valor não disponível" for incomplete token', () => {
        const result = humanizeVarSource('{{incomplete');
        expect(result.label).toBe('Valor não disponível');
        expect(result.focus).toBeUndefined();
      });

      it('should return "Valor não disponível" for token without braces', () => {
        const result = humanizeVarSource('nome');
        expect(result.label).toBe('Valor não disponível');
        expect(result.focus).toBeUndefined();
      });

      it('should handle whitespace around token', () => {
        const result = humanizeVarSource('  {{nome}}  ');
        expect(result.label).toBe('Nome');
        expect(result.focus).toEqual({ type: 'name' });
      });

      it('should handle undefined customFieldLabelByKey', () => {
        const result = humanizeVarSource('{{custom}}', undefined);
        expect(result.label).toBe('Campo: custom');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom' });
      });

      it('should handle empty customFieldLabelByKey', () => {
        const result = humanizeVarSource('{{custom}}', {});
        expect(result.label).toBe('Campo: custom');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom' });
      });
    });

    describe('token format variations', () => {
      it('should handle tokens with underscores and numbers', () => {
        const result = humanizeVarSource('{{field_123_abc}}');
        expect(result.label).toBe('Campo: field_123_abc');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'field_123_abc' });
      });

      it('should handle tokens with dots', () => {
        const result = humanizeVarSource('{{custom.nested.field}}');
        expect(result.label).toBe('Campo: custom.nested.field');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom.nested.field' });
      });
    });
  });

  describe('humanizePrecheckReason', () => {
    describe('empty/null/undefined reasons', () => {
      it('should return "-" for empty string', () => {
        const result = humanizePrecheckReason('');
        expect(result).toEqual({ title: '-' });
      });

      it('should return "-" for whitespace only', () => {
        const result = humanizePrecheckReason('   ');
        expect(result).toEqual({ title: '-' });
      });

      it('should return "-" for null (coerced to string)', () => {
        const result = humanizePrecheckReason(null as unknown as string);
        expect(result).toEqual({ title: '-' });
      });

      it('should return "-" for undefined (coerced to string)', () => {
        const result = humanizePrecheckReason(undefined as unknown as string);
        expect(result).toEqual({ title: '-' });
      });
    });

    describe('variáveis obrigatórias - header/body', () => {
      it('should parse header variable with system token (nome)', () => {
        const reason = 'Variáveis obrigatórias sem valor: header:1 (raw="{{nome}}")';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: Nome');
        expect(result.details).toBe('Cabeçalho • variável {{1}}');
        expect(result.focus).toEqual({ type: 'name' });
      });

      it('should parse body variable with system token (email)', () => {
        const reason = 'Variáveis obrigatórias sem valor: body:email_var (raw="{{contact.email}}")';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: Email');
        expect(result.details).toBe('Corpo • variável {{email_var}}');
        expect(result.focus).toEqual({ type: 'email' });
      });

      it('should parse header variable with empty raw', () => {
        const reason = 'Variáveis obrigatórias sem valor: header:var1 (raw="<vazio>")';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: {{var1}}');
        expect(result.details).toBe('Cabeçalho • variável {{var1}}');
      });

      it('should parse body variable with custom field', () => {
        const reason = 'Variáveis obrigatórias sem valor: body:company (raw="{{company_name}}")';
        const result = humanizePrecheckReason(reason, {
          customFieldLabelByKey: { company_name: 'Nome da Empresa' }
        });

        expect(result.title).toBe('Precisa de: Campo: Nome da Empresa');
        expect(result.details).toBe('Corpo • variável {{company}}');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'company_name' });
      });
    });

    describe('variáveis obrigatórias - button', () => {
      it('should parse button variable with index', () => {
        const reason = 'Variáveis obrigatórias sem valor: button:0:url (raw="{{nome}}")';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: Nome');
        expect(result.details).toBe('Botão 1 • variável {{url}}');
        expect(result.focus).toEqual({ type: 'name' });
      });

      it('should parse button variable with higher index', () => {
        const reason = 'Variáveis obrigatórias sem valor: button:2:action (raw="{{email}}")';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: Email');
        expect(result.details).toBe('Botão 3 • variável {{action}}');
        expect(result.focus).toEqual({ type: 'email' });
      });
    });

    describe('variáveis obrigatórias - multiple variables', () => {
      it('should handle multiple variables and return multi focus', () => {
        const reason = 'Variáveis obrigatórias sem valor: header:1 (raw="{{nome}}"), body:2 (raw="{{email}}")';
        const result = humanizePrecheckReason(reason);

        // Should use the first variable for title/details
        expect(result.title).toBe('Precisa de: Nome');
        expect(result.details).toBe('Cabeçalho • variável {{1}}');

        // Focus should contain both targets (deduplicated)
        expect(result.focus).toEqual({
          type: 'multi',
          targets: [
            { type: 'name' },
            { type: 'email' }
          ]
        });
      });

      it('should deduplicate same targets', () => {
        const reason = 'Variáveis obrigatórias sem valor: header:1 (raw="{{nome}}"), body:2 (raw="{{name}}")';
        const result = humanizePrecheckReason(reason);

        // Both {{nome}} and {{name}} map to name, should be deduplicated
        expect(result.focus).toEqual({ type: 'name' });
      });

      it('should deduplicate same custom fields', () => {
        const reason = 'Variáveis obrigatórias sem valor: header:1 (raw="{{custom}}"), body:2 (raw="{{custom}}")';
        const result = humanizePrecheckReason(reason);

        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom' });
      });
    });

    describe('telefone inválido', () => {
      it.each([
        'Telefone inválido para envio',
        'TELEFONE INVÁLIDO',
        'O telefone é inválido',
      ])('should detect phone invalid reason: "%s"', (reason) => {
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Telefone inválido');
      });

      it('should NOT detect phone invalid without accent in "inválido"', () => {
        // The function specifically checks for "invál" with accent
        const result = humanizePrecheckReason('telefone invalido');
        expect(result.title).toBe('telefone invalido'); // Falls through to default
      });
    });

    describe('opt-out', () => {
      it.each([
        'Contato em opt-out',
        'opt-out ativo',
        'OPT-OUT',
        'opt out',
        'OPT OUT',
        'Usuário solicitou opt-out',
      ])('should detect opt-out reason: "%s"', (reason) => {
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Contato opt-out (não quer receber mensagens)');
      });
    });

    describe('supressão global', () => {
      it.each([
        'Telefone suprimido globalmente',
        'SUPPRESSED',
        'Telefone suprimido manualmente',
      ])('should detect suppression reason: "%s"', (reason) => {
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Telefone suprimido globalmente');
      });

      it('should prioritize suppression over opt-out when both keywords present', () => {
        // Este é o caso do bug: a razão de supressão contém "opt-out" no texto explicativo
        const reason = 'Telefone suprimido globalmente: Usuário solicitou opt-out via mensagem inbound';
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Telefone suprimido globalmente');
      });
    });

    describe('fallback - unknown reasons', () => {
      it('should return original text for unknown reason', () => {
        const reason = 'Algum motivo desconhecido';
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Algum motivo desconhecido');
      });

      it('should trim whitespace from unknown reason', () => {
        const reason = '   Motivo com espaços   ';
        const result = humanizePrecheckReason(reason);
        expect(result.title).toBe('Motivo com espaços');
      });
    });

    describe('edge cases', () => {
      it('should handle reason with only "Variáveis obrigatórias sem valor:" prefix', () => {
        const reason = 'Variáveis obrigatórias sem valor:';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: {{?}}');
      });

      it('should handle malformed variable format', () => {
        const reason = 'Variáveis obrigatórias sem valor: malformed_data';
        const result = humanizePrecheckReason(reason);

        expect(result.title).toBe('Precisa de: {{?}}');
      });

      it('should handle options with empty customFieldLabelByKey', () => {
        const reason = 'Variáveis obrigatórias sem valor: body:field (raw="{{custom_field}}")';
        const result = humanizePrecheckReason(reason, { customFieldLabelByKey: {} });

        expect(result.title).toBe('Precisa de: Campo: custom_field');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom_field' });
      });

      it('should handle options with undefined customFieldLabelByKey', () => {
        const reason = 'Variáveis obrigatórias sem valor: body:field (raw="{{custom_field}}")';
        const result = humanizePrecheckReason(reason, { customFieldLabelByKey: undefined });

        expect(result.title).toBe('Precisa de: Campo: custom_field');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom_field' });
      });

      it('should handle undefined options', () => {
        const reason = 'Variáveis obrigatórias sem valor: body:field (raw="{{custom_field}}")';
        const result = humanizePrecheckReason(reason, undefined);

        expect(result.title).toBe('Precisa de: Campo: custom_field');
        expect(result.focus).toEqual({ type: 'custom_field', key: 'custom_field' });
      });
    });
  });

  describe('type exports', () => {
    it('should export ContactFixTarget type correctly', () => {
      const nameTarget: ContactFixTarget = { type: 'name' };
      const emailTarget: ContactFixTarget = { type: 'email' };
      const customFieldTarget: ContactFixTarget = { type: 'custom_field', key: 'test' };

      expect(nameTarget.type).toBe('name');
      expect(emailTarget.type).toBe('email');
      expect(customFieldTarget.type).toBe('custom_field');
      expect(customFieldTarget.key).toBe('test');
    });

    it('should export HumanizedReason type correctly', () => {
      const reason: HumanizedReason = {
        title: 'Test Title',
        details: 'Test Details',
        focus: { type: 'name' },
      };

      expect(reason.title).toBe('Test Title');
      expect(reason.details).toBe('Test Details');
      expect(reason.focus).toEqual({ type: 'name' });
    });

    it('should allow HumanizedReason without optional fields', () => {
      const reason: HumanizedReason = {
        title: 'Test Title',
      };

      expect(reason.title).toBe('Test Title');
      expect(reason.details).toBeUndefined();
      expect(reason.focus).toBeUndefined();
    });
  });
});
