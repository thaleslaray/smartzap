import { Campaign } from '../types';
import { campaignService } from './campaignService';
import { api } from '@/lib/api';

export interface ChartDataPoint {
  name: string;
  sent: number;
  read: number;
  delivered: number;
  failed: number;
  active: number;
}

export interface DashboardStats {
  sent24h: string;
  deliveryRate: string;
  activeCampaigns: string;
  failedMessages: string;
  chartData: ChartDataPoint[];
}

// API response from /api/dashboard/stats
interface StatsAPIResponse {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  activeCampaigns: number;
  deliveryRate: number;
}

export const dashboardService = {
  /**
   * Buscar stats do dashboard direto da API otimizada.
   * A API faz uma única query SQL agregada no servidor.
   * Observação: sem cache para manter o dashboard “ao vivo”.
   */
  getStats: async (): Promise<DashboardStats> => {
    const statsFallback: StatsAPIResponse = { totalSent: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0, activeCampaigns: 0, deliveryRate: 0 };

    // Fazer ambas chamadas em PARALELO
    const [stats, campaignsResult] = await Promise.all([
      api.safeGet<StatsAPIResponse>('/api/dashboard/stats', statsFallback, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      }),
      campaignService.getAll(),
    ]);
    
    const campaignsPayload =
      campaignsResult as unknown as Campaign[] | { data?: Campaign[] };
    const campaigns: Campaign[] = Array.isArray(campaignsPayload)
      ? campaignsPayload
      : campaignsPayload?.data || [];

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    const bucket = new Map<string, { sent: number; read: number; delivered: number; failed: number; active: number }>();
    for (let i = 0; i < 30; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = day.toISOString().slice(0, 10);
      bucket.set(key, { sent: 0, read: 0, delivered: 0, failed: 0, active: 0 });
    }

    campaigns.forEach((campaign) => {
      const rawDate = campaign.lastSentAt || campaign.startedAt || campaign.createdAt;
      if (!rawDate) return;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toISOString().slice(0, 10);
      const entry = bucket.get(key);
      if (!entry) return;
      entry.sent += campaign.sent || campaign.recipients || 0;
      entry.read += campaign.read || 0;
      entry.delivered += campaign.delivered || 0;
      entry.failed += campaign.failed || 0;
      if (campaign.status === 'Enviando' || campaign.status === 'Agendado') {
        entry.active += 1;
      }
    });

    const chartData = Array.from(bucket.entries()).map(([key, value]) => {
      const [year, month, day] = key.split('-');
      return {
        name: `${day}/${month}`,
        sent: value.sent,
        read: value.read,
        delivered: value.delivered,
        failed: value.failed,
        active: value.active,
      };
    });
    
    return {
      sent24h: stats.totalSent.toLocaleString(),
      deliveryRate: `${stats.deliveryRate}%`,
      activeCampaigns: stats.activeCampaigns.toString(),
      failedMessages: stats.totalFailed.toString(),
      chartData
    };
  },

  /**
   * Buscar campanhas recentes (top 5).
   * Sem cache para manter o dashboard “ao vivo”.
   */
  getRecentCampaigns: async (): Promise<Campaign[]> => {
    try {
      const result = await campaignService.list({ limit: 5, offset: 0, search: '', status: 'All' });
      return result.data || [];
    } catch {
      return [];
    }
  }
};
