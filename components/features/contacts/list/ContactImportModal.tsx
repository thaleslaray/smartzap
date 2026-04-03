'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  X,
  UploadCloud,
  AlertCircle,
  FileText,
  CheckCircle2,
  Loader2,
  Settings2,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  Copy,
  Wand2,
  ChevronDown,
  HelpCircle
} from 'lucide-react';
import {
  ContactStatus,
  CustomFieldDefinition,
  ImportContact,
  CsvPreviewData,
  ColumnMapping,
  ImportResult
} from './types';
import { parseCSV, formatPhoneNumber } from './utils';
import { normalizePhoneNumber } from '@/lib/phone-formatter';
import { ContactFieldMappingSheet } from './ContactFieldMappingSheet';
import { Container } from '@/components/ui/container';
import { StatusBadge } from '@/components/ui/status-badge';

// Estatísticas de pré-importação
interface ImportPreviewStats {
  totalRows: number;
  validContacts: number;
  invalidPhones: number;
  duplicatesInCsv: number;      // Duplicados dentro do CSV
  duplicatesInDatabase: number; // Já existem no banco
}

export interface ContactImportModalProps {
  isOpen: boolean;
  isImporting: boolean;
  customFields: CustomFieldDefinition[];
  onClose: () => void;
  onImport: (contacts: ImportContact[]) => Promise<{ inserted: number; updated: number }>;
  onCustomFieldCreated: (field: CustomFieldDefinition) => void;
  onCustomFieldDeleted: (id: string) => void;
}

type ImportStep = 1 | 2 | 3;

const initialColumnMapping: ColumnMapping = {
  name: '',
  phone: '',
  email: '',
  tags: '',
  defaultTag: '',
  custom_fields: {}
};

export const ContactImportModal: React.FC<ContactImportModalProps> = ({
  isOpen,
  isImporting,
  customFields,
  onClose,
  onImport,
  onCustomFieldCreated,
  onCustomFieldDeleted
}) => {
  const [step, setStep] = useState<ImportStep>(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewData>({ headers: [], rows: [] });
  const [allRows, setAllRows] = useState<string[][]>([]); // Todas as linhas do CSV
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set()); // Telefones já no banco
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(initialColumnMapping);
  const [importResult, setImportResult] = useState<ImportResult>({ total: 0, inserted: 0, updated: 0, errors: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [invalidPhoneRows, setInvalidPhoneRows] = useState<Array<{ name: string; rawPhone: string }>>([]);
  const [isMappingSheetOpen, setIsMappingSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Buscar telefones existentes quando o modal abre
  useEffect(() => {
    if (isOpen) {
      const fetchExistingPhones = async () => {
        try {
          const { contactService } = await import('@/services/contactService');
          const contacts = await contactService.getAll();
          const phones = new Set(contacts.map(c => c.phone).filter(Boolean));
          setExistingPhones(phones);
        } catch (err) {
          console.error('Failed to fetch existing phones:', err);
        }
      };
      fetchExistingPhones();
    }
  }, [isOpen]);

  // Calcular estatísticas de pré-importação baseado no mapeamento atual
  const previewStats = useMemo((): ImportPreviewStats => {
    if (allRows.length === 0 || !columnMapping.phone) {
      return { totalRows: 0, validContacts: 0, invalidPhones: 0, duplicatesInCsv: 0, duplicatesInDatabase: 0 };
    }

    const phoneIdx = csvPreview.headers.indexOf(columnMapping.phone);
    if (phoneIdx === -1) {
      return { totalRows: allRows.length, validContacts: 0, invalidPhones: allRows.length, duplicatesInCsv: 0, duplicatesInDatabase: 0 };
    }

    const seenPhones = new Set<string>();
    let validContacts = 0;
    let invalidPhones = 0;
    let duplicatesInCsv = 0;
    let duplicatesInDatabase = 0;

    allRows.forEach(row => {
      const phone = formatPhoneNumber(row[phoneIdx] || '');

      if (phone.length <= 8) {
        invalidPhones++;
      } else if (seenPhones.has(phone)) {
        // Duplicado dentro do próprio CSV
        duplicatesInCsv++;
      } else if (existingPhones.has(phone)) {
        // Já existe no banco de dados
        duplicatesInDatabase++;
        seenPhones.add(phone); // Marcar para não contar como duplicado do CSV também
      } else {
        seenPhones.add(phone);
        validContacts++;
      }
    });

    return { totalRows: allRows.length, validContacts, invalidPhones, duplicatesInCsv, duplicatesInDatabase };
  }, [allRows, columnMapping.phone, csvPreview.headers, existingPhones]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      return;
    }

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        return;
      }

      setCsvPreview({ headers, rows: rows.slice(0, 3) });
      setAllRows(rows); // Armazenar todas as linhas para cálculo de estatísticas

      // Auto-map columns based on header names
      const lowerHeaders = headers.map(h => h.toLowerCase());
      const autoMapping: ColumnMapping = {
        name: headers[lowerHeaders.findIndex(h => h.includes('nome') || h.includes('name'))] || '',
        phone: headers[lowerHeaders.findIndex(h => h.includes('tele') || h.includes('phone') || h.includes('cel') || h.includes('what'))] || '',
        email: headers[lowerHeaders.findIndex(h => h.includes('email') || h.includes('mail'))] || '',
        tags: headers[lowerHeaders.findIndex(h => h.includes('tag') || h.includes('grupo'))] || '',
        defaultTag: '',
        custom_fields: {}
      };

      // Auto-map custom fields
      if (customFields) {
        customFields.forEach(field => {
          const match = headers.find(h =>
            h.toLowerCase() === field.key.toLowerCase() ||
            h.toLowerCase() === field.label.toLowerCase()
          );
          if (match) {
            autoMapping.custom_fields[field.key] = match;
          }
        });
      }

      setColumnMapping(autoMapping);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    if (!columnMapping.phone || !csvFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);

      const nameIdx = headers.indexOf(columnMapping.name);
      const phoneIdx = headers.indexOf(columnMapping.phone);
      const emailIdx = headers.indexOf(columnMapping.email);
      const tagsIdx = headers.indexOf(columnMapping.tags);

      // Create index map for custom fields
      const customFieldIndices: Record<string, number> = {};
      Object.entries(columnMapping.custom_fields || {}).forEach(([key, header]) => {
        if (header) {
          const idx = headers.indexOf(header);
          if (idx !== -1) {
            customFieldIndices[key] = idx;
          }
        }
      });

      const contactsToImport: ImportContact[] = rows.map(row => {
        const phone = normalizePhoneNumber(row[phoneIdx] || '');

        // Extract custom fields
        const rowCustomFields: Record<string, any> = {};
        Object.entries(customFieldIndices).forEach(([key, idx]) => {
          if (row[idx]) {
            rowCustomFields[key] = row[idx].trim();
          }
        });

        // Parse tags
        const rowTags = tagsIdx >= 0
          ? row[tagsIdx].split(/[,;]/).map(t => t.trim()).filter(t => t)
          : [];

        const defaultTags = columnMapping.defaultTag
          ? columnMapping.defaultTag.split(',').map(t => t.trim()).filter(t => t)
          : [];

        const allTags = [...new Set([...rowTags, ...defaultTags])];
        if (allTags.length === 0) allTags.push('Importado');

        // Email vazio deve ser undefined para passar na validação Zod
        const emailValue = emailIdx !== -1 ? row[emailIdx]?.trim() : undefined;

        return {
          name: nameIdx !== -1 ? row[nameIdx] : undefined,
          phone,
          email: emailValue || undefined, // Converte "" para undefined
          tags: allTags,
          status: ContactStatus.UNKNOWN,
          custom_fields: rowCustomFields
        };
      }).filter(c => c.phone.length > 8);

      // Linhas descartadas por telefone inválido (< 9 dígitos após formatação)
      const filteredOutCount = rows.length - contactsToImport.length;

      // Coleta os registros com telefone inválido para exibir o prompt de correção
      const badRows = rows
        .filter(row => normalizePhoneNumber(row[phoneIdx] || '').length <= 8 && (row[phoneIdx] || '').trim().length > 0)
        .map(row => ({
          name: nameIdx !== -1 ? (row[nameIdx] || '') : '',
          rawPhone: (row[phoneIdx] || '').trim(),
        }));
      setInvalidPhoneRows(badRows);

      try {
        const result = await onImport(contactsToImport);
        setImportError(null);
        setImportResult({
          total: rows.length,
          inserted: result.inserted,
          updated: result.updated,
          errors: filteredOutCount,
        });
        setStep(3);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido ao importar contatos';
        setImportError(message);
      }
    };
    reader.readAsText(csvFile);
  };

  const resetAndClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setCsvFile(null);
      setCsvPreview({ headers: [], rows: [] });
      setAllRows([]);
      setColumnMapping(initialColumnMapping);
      setInvalidPhoneRows([]);
    }, 300);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Container variant="surface" padding="xl" className="w-full max-w-2xl shadow-2xl animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Importar Contatos</h2>
            <p className="text-sm text-gray-400">Adicione múltiplos contatos de uma vez via CSV</p>
          </div>
          <button
            type="button"
            aria-label="Fechar importação de contatos"
            onClick={resetAndClose}
          >
            <X className="text-gray-500 hover:text-white" />
          </button>
        </div>

        {/* Steps Content */}
        <div className="flex-1 overflow-y-auto px-1">
          {step === 1 && (
            <ImportStepUpload
              fileInputRef={fileInputRef}
              onFileSelect={handleFileSelect}
            />
          )}

          {step === 2 && (
            <>
              <ImportStepMapping
                csvFile={csvFile}
                csvPreview={csvPreview}
                columnMapping={columnMapping}
                customFields={customFields}
                previewStats={previewStats}
                onColumnMappingChange={setColumnMapping}
                onOpenMappingSheet={() => setIsMappingSheetOpen(true)}
                onReset={resetAndClose}
              />
              {importError && (
                <div className="mt-4 flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Falha ao importar contatos</p>
                    <p className="text-xs text-red-400/70 mt-0.5">{importError}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <ImportStepSuccess result={importResult} invalidRows={invalidPhoneRows} onRetryFixed={onImport} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-6 mt-6 border-t border-white/5 flex justify-end gap-3">
          {step === 1 && (
            <button onClick={resetAndClose} className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium">
              Cancelar
            </button>
          )}

          {step === 2 && (
            <>
              <button onClick={resetAndClose} className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium" disabled={isImporting}>
                Cancelar
              </button>
              <button
                onClick={executeImport}
                disabled={isImporting}
                className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-primary-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <><Loader2 size={18} className="animate-spin" /> Processando...</>
                ) : (
                  <><CheckCircle2 size={18} /> Confirmar Importação</>
                )}
              </button>
            </>
          )}

          {step === 3 && (
            <button
              onClick={resetAndClose}
              className="bg-white text-black px-8 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition-colors"
            >
              Fechar
            </button>
          )}
        </div>

        {/* Custom Fields Mapping Sheet */}
        <ContactFieldMappingSheet
          isOpen={isMappingSheetOpen}
          onOpenChange={setIsMappingSheetOpen}
          customFields={customFields}
          csvPreview={csvPreview}
          columnMapping={columnMapping}
          onColumnMappingChange={setColumnMapping}
          onCustomFieldCreated={onCustomFieldCreated}
          onCustomFieldDeleted={onCustomFieldDeleted}
        />
      </Container>
    </div>
  );
};

// Step 1: Upload Component
interface ImportStepUploadProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ImportStepUpload: React.FC<ImportStepUploadProps> = ({ fileInputRef, onFileSelect }) => (
  <div className="space-y-6">
    <div
      className="border-2 border-dashed border-zinc-800 hover:border-primary-500/50 hover:bg-white/5 rounded-2xl p-12 transition-all cursor-pointer text-center group"
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
        <UploadCloud size={32} className="text-gray-400 group-hover:text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Clique para selecionar ou arraste aqui</h3>
      <p className="text-gray-500 text-sm">Suporta arquivos .csv (Máx 5MB)</p>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv"
        onChange={onFileSelect}
      />
    </div>

    <div className="bg-zinc-900/50 rounded-xl p-4 flex gap-3 border border-white/5">
      <AlertCircle className="text-primary-500 shrink-0" size={20} />
      <div className="text-sm text-gray-400">
        <p className="text-white font-medium mb-1">Dica de Formatação</p>
        <p>Seu arquivo deve ter cabeçalhos na primeira linha (Ex: Nome, Telefone). O sistema tentará identificar as colunas automaticamente.</p>
      </div>
    </div>
  </div>
);

// Step 2: Mapping Component
interface ImportStepMappingProps {
  csvFile: File | null;
  csvPreview: CsvPreviewData;
  columnMapping: ColumnMapping;
  customFields: CustomFieldDefinition[];
  previewStats: ImportPreviewStats;
  onColumnMappingChange: (mapping: ColumnMapping) => void;
  onOpenMappingSheet: () => void;
  onReset: () => void;
}

const ImportStepMapping: React.FC<ImportStepMappingProps> = ({
  csvFile,
  csvPreview,
  columnMapping,
  customFields,
  previewStats,
  onColumnMappingChange,
  onOpenMappingSheet,
  onReset
}) => (
  <div className="space-y-6">
    <div className="flex items-center gap-3 bg-zinc-900 border border-white/10 p-3 rounded-lg mb-6">
      <FileText size={20} className="text-primary-400" />
      <span className="text-white text-sm font-medium flex-1 truncate">{csvFile?.name}</span>
      <button onClick={onReset} className="text-xs text-red-400 hover:underline">Trocar</button>
    </div>

    <div className="grid grid-cols-1 gap-6">
      <div className="space-y-4">
        <h3 className="text-white font-medium text-sm uppercase tracking-wider">Mapear Colunas</h3>

        {/* Name Map */}
        <ColumnMappingSelect
          label="Nome do Contato"
          value={columnMapping.name}
          headers={csvPreview.headers}
          onChange={(value) => onColumnMappingChange({ ...columnMapping, name: value })}
        />

        {/* Phone Map */}
        <ColumnMappingSelect
          label="Telefone / WhatsApp"
          value={columnMapping.phone}
          headers={csvPreview.headers}
          onChange={(value) => onColumnMappingChange({ ...columnMapping, phone: value })}
          required
        />

        {/* Email Map */}
        <ColumnMappingSelect
          label="E-mail"
          value={columnMapping.email}
          headers={csvPreview.headers}
          onChange={(value) => onColumnMappingChange({ ...columnMapping, email: value })}
        />

        {/* Tags Map */}
        <ColumnMappingSelect
          label="Tags"
          value={columnMapping.tags}
          headers={csvPreview.headers}
          onChange={(value) => onColumnMappingChange({ ...columnMapping, tags: value })}
          placeholder="Nenhuma coluna de tags"
        />

        {/* Default Tag Input */}
        {!columnMapping.tags && (
          <div className="grid grid-cols-2 gap-4 items-center bg-primary-500/5 p-3 rounded-lg border border-primary-500/20">
            <label className="text-gray-400 text-sm">
              <span className="text-primary-400">*</span> Tag padrão para todos
            </label>
            <input
              type="text"
              className="bg-zinc-900 border border-primary-500/30 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary-500"
              placeholder="Ex: Importado, Lead"
              value={columnMapping.defaultTag || ''}
              onChange={(e) => onColumnMappingChange({ ...columnMapping, defaultTag: e.target.value })}
            />
          </div>
        )}

        {/* Custom Fields Section */}
        <div className="border-t border-white/10 pt-4 mt-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-sm uppercase tracking-wider">Campos Personalizados</h3>
            {customFields && customFields.length > 0 && (
              <div className="text-xs text-gray-400">
                {Object.keys(columnMapping.custom_fields || {}).length} de {customFields.length} mapeados
              </div>
            )}
          </div>

          {customFields && customFields.length > 0 ? (
            <div className="bg-zinc-900/50 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400">
                    <Settings2 size={18} />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Configurar Mapeamento</p>
                    <p className="text-xs text-gray-400">
                      {Object.keys(columnMapping.custom_fields || {}).length === 0
                        ? "Nenhum campo vinculado"
                        : "Clique para ajustar vínculos"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onOpenMappingSheet}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg border border-white/10 transition-colors flex items-center gap-2"
                >
                  Configurar
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic bg-zinc-900/50 p-3 rounded-lg border border-white/5">
              Nenhum campo personalizado encontrado. Crie campos personalizados nas configurações para mapeá-los aqui.
            </div>
          )}
        </div>
      </div>

      {/* Estatísticas de Pré-Importação */}
      {columnMapping.phone && (
        <div className="mt-4">
          <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3">
            Resumo da importação
          </h3>
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-zinc-900/50 rounded-lg p-2.5 border border-white/10 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Users size={12} className="text-gray-400" />
                <span className="text-base font-bold text-white">{previewStats.totalRows}</span>
              </div>
              <p className="text-[9px] text-gray-500 uppercase">Total</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2.5 border border-emerald-500/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <UserCheck size={12} className="text-emerald-400" />
                <span className="text-base font-bold text-emerald-400">{previewStats.validContacts}</span>
              </div>
              <p className="text-[9px] text-emerald-500/70 uppercase">Novos</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-2.5 border border-blue-500/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Copy size={12} className="text-blue-400" />
                <span className="text-base font-bold text-blue-400">{previewStats.duplicatesInDatabase}</span>
              </div>
              <p className="text-[9px] text-blue-500/70 uppercase">Já existem</p>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Copy size={12} className="text-amber-400" />
                <span className="text-base font-bold text-amber-400">{previewStats.duplicatesInCsv}</span>
              </div>
              <p className="text-[9px] text-amber-500/70 uppercase">Repetidos</p>
            </div>
            <div
              className="bg-red-500/10 rounded-lg p-2.5 border border-red-500/20 text-center"
              title="Telefones com menos de 9 dígitos após formatação. Serão ignorados na importação."
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <UserX size={12} className="text-red-400" />
                <span className="text-base font-bold text-red-400">{previewStats.invalidPhones}</span>
              </div>
              <p className="text-[9px] text-red-500/70 uppercase">Inválidos</p>
            </div>
          </div>
          {(previewStats.duplicatesInDatabase > 0 || previewStats.duplicatesInCsv > 0 || previewStats.invalidPhones > 0) && (
            <p className="text-xs text-gray-500 mt-2">
              * Apenas {previewStats.validContacts} novos contatos serão adicionados
            </p>
          )}
        </div>
      )}

      {/* Preview Table */}
      <div className="mt-4">
        <h3 className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3">
          Pré-visualização dos dados (3 linhas)
        </h3>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-xs text-left">
            <thead className="bg-white/5 text-gray-300">
              <tr>
                {csvPreview.headers.map(h => (
                  <th
                    key={h}
                    className={`px-3 py-2 font-medium ${Object.values(columnMapping).includes(h) ? 'text-primary-400 bg-primary-500/10' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-zinc-900/30">
              {csvPreview.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-gray-400 border-r border-white/5 last:border-0">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

// Column Mapping Select Component
interface ColumnMappingSelectProps {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

const ColumnMappingSelect: React.FC<ColumnMappingSelectProps> = ({
  label,
  value,
  headers,
  onChange,
  required,
  placeholder = "Ignorar coluna"
}) => (
  <div className="grid grid-cols-2 gap-4 items-center">
    <label className="text-gray-400 text-sm">
      {label} {required && <span className="text-primary-500">*</span>}
    </label>
    <select
      className={`bg-zinc-900 border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-primary-500 ${required ? 'border-primary-500/30' : 'border-white/10'}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{required ? "Selecione..." : placeholder}</option>
      {headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  </div>
);

// Step 3: Success Component

// Tenta corrigir um telefone para formato brasileiro E.164
// Retorna o número corrigido ou null se não conseguir
const tryFixBrazilianPhone = (rawPhone: string): string | null => {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Já tem DDI 55 + DDD (2) + número (8-9) = 12-13 dígitos → só adiciona +
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return `+${digits}`;
  }

  // Tem DDD (2) + número (8-9) = 10-11 dígitos → adiciona +55
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Menos de 10 dígitos → sem DDD, não dá pra corrigir com segurança
  return null;
};

const getInvalidReason = (rawPhone: string): string => {
  if (!rawPhone) return 'Campo vazio';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 0) return 'Sem dígitos válidos';
  return 'Muito curto — use DDI+DDD+número';
};

interface ImportStepSuccessProps {
  result: ImportResult;
  invalidRows?: Array<{ name: string; rawPhone: string }>;
  onRetryFixed?: (contacts: ImportContact[]) => Promise<{ inserted: number; updated: number }>;
}

const ImportStepSuccess: React.FC<ImportStepSuccessProps> = ({ result, invalidRows = [], onRetryFixed }) => {
  const [fixState, setFixState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [fixResult, setFixResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [stillInvalid, setStillInvalid] = useState(invalidRows);
  const [fixError, setFixError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);

  // Quantos conseguimos corrigir automaticamente
  const fixableCount = stillInvalid.filter(r => tryFixBrazilianPhone(r.rawPhone) !== null).length;

  const handleAutoFix = async () => {
    if (!onRetryFixed) return;
    setFixState('loading');
    setFixError(null);

    const fixable: ImportContact[] = [];
    const unfixable: Array<{ name: string; rawPhone: string }> = [];

    for (const row of stillInvalid) {
      const fixed = tryFixBrazilianPhone(row.rawPhone);
      if (fixed) {
        fixable.push({
          name: row.name || undefined,
          phone: fixed,
          tags: ['Importado'],
          status: ContactStatus.UNKNOWN,
        });
      } else {
        unfixable.push(row);
      }
    }

    try {
      const res = await onRetryFixed(fixable);
      setFixResult(res);
      setStillInvalid(unfixable);
      setFixState('done');
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Erro ao importar corrigidos');
      setFixState('idle');
    }
  };

  return (
  <div className="text-center py-8">
    <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500">
      <CheckCircle2 size={40} />
    </div>
    <h3 className="text-2xl font-bold text-white mb-2">Importação Concluída!</h3>
    <p className="text-gray-400 mb-8">Seus contatos foram processados com sucesso.</p>

    <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto mb-8">
      <Container variant="surface" padding="md">
        <p className="text-2xl font-bold text-white">{result.total}</p>
        <p className="text-xs text-gray-500">Linhas</p>
      </Container>
      <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
        <p className="text-2xl font-bold text-emerald-400">{result.inserted}</p>
        <p className="text-xs text-emerald-500/70">Novos</p>
      </div>
      <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
        <p className="text-2xl font-bold text-blue-400">{result.updated}</p>
        <p className="text-xs text-blue-500/70">Atualizados</p>
      </div>
      <div
        className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center"
        title={result.errors > 0 ? 'Linhas ignoradas por telefone inválido' : undefined}
      >
        <p className="text-2xl font-bold text-gray-400">{result.errors}</p>
        <p className="text-xs text-gray-500">Ignorados</p>
      </div>
    </div>

    {/* Feedback da autocorreção */}
    {fixState === 'done' && fixResult && (
      <div className="flex items-center justify-center gap-2 max-w-lg mx-auto mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-400">
          {fixResult.inserted + fixResult.updated} número{fixResult.inserted + fixResult.updated !== 1 ? 's corrigidos' : ' corrigido'} e importado{fixResult.inserted + fixResult.updated !== 1 ? 's' : ''} com sucesso!
        </p>
      </div>
    )}

    {/* Tabela de inválidos restantes */}
    {stillInvalid.length > 0 && (
      <div className="max-w-lg mx-auto text-left">
        {/* Banner com botão de autocorreção */}
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-t-lg">
          <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400/80">
              {stillInvalid.length} contato{stillInvalid.length !== 1 ? 's ignorados' : ' ignorado'} por telefone inválido.
            </p>
            {fixableCount > 0 && fixState !== 'done' && (
              <p className="text-xs text-amber-400/60 mt-0.5">
                {fixableCount} podem ser corrigidos automaticamente (adicionar +55).
              </p>
            )}
          </div>
          {fixableCount > 0 && fixState !== 'done' && onRetryFixed && (
            <button
              onClick={handleAutoFix}
              disabled={fixState === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {fixState === 'loading' ? (
                <><Loader2 size={12} className="animate-spin" /> Corrigindo...</>
              ) : (
                <><Wand2 size={12} /> Corrigir +55</>
              )}
            </button>
          )}
        </div>

        {fixError && (
          <p className="text-xs text-red-400 px-3 py-2 bg-red-500/10 border-x border-amber-500/20">{fixError}</p>
        )}

        <div className="overflow-x-auto border border-t-0 border-amber-500/20 rounded-b-lg">
          <table className="w-full text-xs">
            <thead className="bg-amber-500/10">
              <tr>
                <th className="px-3 py-2 text-left text-amber-400/70 font-medium">Nome</th>
                <th className="px-3 py-2 text-left text-amber-400/70 font-medium">Telefone original</th>
                <th className="px-3 py-2 text-left text-amber-400/70 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-zinc-900/40">
              {stillInvalid.map((row, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate">
                    {row.name || <span className="text-gray-600 italic">sem nome</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-red-400">
                    {row.rawPhone || <span className="text-gray-600 italic">vazio</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-400">{getInvalidReason(row.rawPhone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Ajuda expansível — formatos aceitos */}
        <div className="mt-3">
          <button
            onClick={() => setShowFormats(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Quais formatos de telefone são aceitos?
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFormats ? 'rotate-180' : ''}`} />
          </button>

          {showFormats && (
            <div className="mt-2 rounded-lg border border-white/10 bg-zinc-900/60 p-3 space-y-3 text-xs">
              {/* Corrigido automaticamente */}
              <div>
                <p className="text-emerald-400 font-medium mb-1.5">✅ Aceitos e corrigidos automaticamente</p>
                <table className="w-full">
                  <thead>
                    <tr className="text-gray-500 text-[10px]">
                      <th className="text-left pb-1 font-medium w-1/2">Você coloca no CSV</th>
                      <th className="text-left pb-1 font-medium">Como fica salvo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      ['11 99999-0001',        '+5511999990001'],
                      ['(21) 9 8888-0002',     '+5521988880002'],
                      ['31-97777-0003',         '+5531977770003'],
                      ['+5511999990001',        '+5511999990001'],
                      ['+1 415 555 0001',       '+14155550001'],
                    ].map(([in_, out_], i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2 font-mono text-gray-300">{in_}</td>
                        <td className="py-1 font-mono text-emerald-400">{out_}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Rejeitados */}
              <div>
                <p className="text-red-400 font-medium mb-1.5">❌ Rejeitados — o que fazer</p>
                <table className="w-full">
                  <thead>
                    <tr className="text-gray-500 text-[10px]">
                      <th className="text-left pb-1 font-medium w-1/3">Exemplo</th>
                      <th className="text-left pb-1 font-medium">Problema</th>
                      <th className="text-left pb-1 font-medium">Solução</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      ['9999',    'Número muito curto',        'Use o número completo com DDD'],
                      ['11',      'Só o código da cidade',     'Adicione o número depois do DDD'],
                      ['',        'Campo vazio',                'Preencha o telefone no CSV'],
                      ['11abc99', 'Letras no número',          'Use apenas dígitos'],
                    ].map(([ex, prob, sol], i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2 font-mono text-red-400">{ex || <span className="italic text-gray-600">vazio</span>}</td>
                        <td className="py-1 pr-2 text-gray-400">{prob}</td>
                        <td className="py-1 text-gray-300">{sol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-gray-600 text-[10px] pt-1 border-t border-white/5">
                Números brasileiros sem código de país (+55) são corrigidos automaticamente.
                Internacionais precisam do código do país (ex: +1, +33, +351).
              </p>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
};
