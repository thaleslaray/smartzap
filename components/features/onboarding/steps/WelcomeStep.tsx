'use client';

import React from 'react';
import { Smartphone, Clock } from 'lucide-react';
import { OnboardingPath } from '../hooks/useOnboardingProgress';

interface WelcomeStepProps {
  onSelectPath: (path: OnboardingPath) => void;
}

export function WelcomeStep({ onSelectPath }: WelcomeStepProps) {
  return (
    <div className="space-y-4 pt-2">
      {/* Opção única: Configurar do zero */}
      <button
        onClick={() => onSelectPath('guided')}
        className="w-full p-4 rounded-xl border border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-800/50 transition-all text-left group"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
            <Smartphone className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white mb-1">Configurar do zero</h3>
            <p className="text-sm text-zinc-400 mb-2">
              Guia passo a passo para criar sua conta no Meta e conectar seu número de telefone.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3.5 h-3.5" />
              <span>~20-30 minutos</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
