'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

interface OnboardingStatus {
    onboardingCompleted: boolean
    permanentTokenConfirmed: boolean
}

/**
 * Hook para gerenciar o status do onboarding.
 * 
 * REGRA SIMPLES:
 * - Fonte da verdade = BANCO DE DADOS (sempre)
 * - Se API falha = assume completo (não incomoda o usuário)
 * - Sem localStorage como fallback (evita problemas de sync)
 */
export function useOnboardingStatus() {
    const queryClient = useQueryClient()
    
    const { 
        data: dbStatus, 
        isLoading, 
        isError,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['onboardingStatus'],
        queryFn: async (): Promise<OnboardingStatus> => {
            const response = await fetch('/api/settings/onboarding')
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            const data = await response.json()
            return data
        },
        staleTime: 0, // Sempre busca dados frescos
        gcTime: 10 * 60 * 1000,
        retry: 3,
        retryDelay: 1000,
        refetchOnMount: 'always', // Sempre refetch ao montar
    })
    
    // Marca como completo no banco
    const markComplete = useCallback(async () => {
        try {
            await fetch('/api/settings/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ onboardingCompleted: true }),
            })
            refetch()
        } catch (error) {
            console.error('Erro ao salvar onboarding no banco:', error)
        }
        
        queryClient.invalidateQueries({ queryKey: ['healthStatus'] })
    }, [refetch, queryClient])
    
    // Fonte da verdade = banco. Em erro, o react-query mantém o último `dbStatus`
    // conhecido (respeitado aqui). Em erro SEM dado algum (ex.: usuário novo cuja 1ª
    // request falhou) NÃO assumimos completo — senão o onboarding nunca apareceria.
    // O modal tem escape ("Configurar depois"), então mostrar a mais é seguro.
    const isCompleted = dbStatus?.onboardingCompleted === true
    
    return {
        /** Se o onboarding foi completado (DB = true OU erro na API) */
        isCompleted,
        /** Se ainda está carregando o status inicial */
        isLoading,
        /** Se houve erro ao buscar do banco */
        isError,
        /** Se o token permanente foi confirmado */
        isPermanentTokenConfirmed: dbStatus?.permanentTokenConfirmed ?? false,
        /** Dados brutos do banco */
        dbStatus,
        /** Marca o onboarding como completo */
        markComplete,
        /** Refaz a query */
        refetch,
    }
}
