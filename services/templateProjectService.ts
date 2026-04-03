import { TemplateProject, TemplateProjectItem, CreateTemplateProjectDTO, ProjectStatus } from '@/types';
import { api } from '@/lib/api';

export type { TemplateProject, TemplateProjectItem, CreateTemplateProjectDTO, ProjectStatus };

export const templateProjectService = {
    // --- Projects ---

    getAll: async (): Promise<TemplateProject[]> =>
        api.get<TemplateProject[]>('/api/template-projects'),

    getById: async (id: string): Promise<TemplateProject & { items: TemplateProjectItem[] }> =>
        api.get<TemplateProject & { items: TemplateProjectItem[] }>(`/api/template-projects/${id}`),

    create: async (dto: CreateTemplateProjectDTO): Promise<TemplateProject> =>
        api.post<TemplateProject>('/api/template-projects', dto),

    update: async (id: string, updates: Partial<TemplateProject>): Promise<TemplateProject> =>
        api.patch<TemplateProject>(`/api/template-projects/${id}`, updates),

    delete: async (id: string, deleteMetaTemplates: boolean = false): Promise<void> => {
        const url = deleteMetaTemplates
            ? `/api/template-projects/${id}?deleteMetaTemplates=true`
            : `/api/template-projects/${id}`;
        return api.del(url);
    },

    // --- Items ---

    updateItem: async (id: string, updates: Partial<TemplateProjectItem>): Promise<TemplateProjectItem> =>
        api.patch<TemplateProjectItem>(`/api/template-projects/items/${id}`, updates),

    deleteItem: async (id: string): Promise<void> =>
        api.del(`/api/template-projects/items/${id}`),
};
