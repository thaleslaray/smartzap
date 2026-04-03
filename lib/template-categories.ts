/**
 * Mapeamento estático das categorias de utility templates.
 * Associa cada UtilityCategory ao nome e ícone exibidos na UI.
 */

import type { UtilityCategory } from '@/services/templateService'

export const UTILITY_CATEGORIES: Record<UtilityCategory, { name: string; icon: string }> = {
  order_confirmation: { name: 'Confirmação de Pedido', icon: '📦' },
  shipping_update: { name: 'Atualização de Envio', icon: '🚚' },
  delivery_notification: { name: 'Notificação de Entrega', icon: '✅' },
  payment_reminder: { name: 'Lembrete de Pagamento', icon: '💳' },
  appointment_reminder: { name: 'Lembrete de Agendamento', icon: '📅' },
  account_update: { name: 'Atualização de Conta', icon: '👤' },
  ticket_status: { name: 'Status de Ticket', icon: '🎫' },
  subscription_update: { name: 'Atualização de Assinatura', icon: '🔄' },
  feedback_request: { name: 'Solicitação de Feedback', icon: '⭐' },
  verification_code: { name: 'Código de Verificação', icon: '🔐' },
  password_reset: { name: 'Recuperação de Senha', icon: '🔑' },
  security_alert: { name: 'Alerta de Segurança', icon: '🚨' },
  reservation_confirmation: { name: 'Confirmação de Reserva', icon: '🎟️' },
  service_completion: { name: 'Serviço Concluído', icon: '🛠️' },
  document_ready: { name: 'Documento Pronto', icon: '📄' },
}
