import { CustomFieldDefinition } from '../types';
import { api } from '../lib/api';

export const customFieldService = {
    getAll: async (entityType: 'contact' | 'deal' = 'contact'): Promise<CustomFieldDefinition[]> =>
        api.get<CustomFieldDefinition[]>(`/api/custom-fields?entityType=${entityType}`, { cache: 'no-store' }),

    create: async (data: Omit<CustomFieldDefinition, 'id' | 'created_at'>): Promise<CustomFieldDefinition> =>
        api.post<CustomFieldDefinition>('/api/custom-fields', data),

    delete: async (id: string): Promise<void> =>
        api.del(`/api/custom-fields/${id}`),
};
