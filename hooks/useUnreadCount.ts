/**
 * T069: Lightweight hook for unread conversations count
 * Used by sidebar to display unread badge without loading full conversation data
 *
 * Realtime: gerenciado pelo CentralizedRealtimeProvider (T072), que já subscreve
 * inbox_conversations e inbox_messages e invalida 'inbox-unread-count' automaticamente.
 * Canal próprio removido para evitar conflito "cannot add postgres_changes after subscribe()".
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'

const UNREAD_COUNT_KEY = ['inbox-unread-count']

/**
 * Lightweight hook that returns total count of unread conversations.
 * Realtime updates são recebidas via CentralizedRealtimeProvider.
 */
export function useUnreadCount() {
  const supabase = useMemo(() => getSupabaseBrowser(), [])

  const query = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      if (!supabase) return 0

      const { count, error } = await supabase
        .from('inbox_conversations')
        .select('*', { count: 'exact', head: true })
        .gt('unread_count', 0)
        .eq('status', 'open')

      if (error) {
        console.error('[useUnreadCount] Error fetching count:', error)
        return 0
      }

      return count ?? 0
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!supabase,
  })

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  }
}
