'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, CircleUser } from 'lucide-react'
import { ContactStatus } from '@/types'

interface ContactBulkStatusModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onApply: (status: ContactStatus) => void
  isLoading?: boolean
}

export function ContactBulkStatusModal({
  open,
  onOpenChange,
  selectedCount,
  onApply,
  isLoading,
}: ContactBulkStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ContactStatus | null>(null)

  const handleApply = () => {
    if (!selectedStatus) return
    onApply(selectedStatus)
    setSelectedStatus(null)
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setSelectedStatus(null)
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleUser size={18} />
            Editar status — {selectedCount} contato{selectedCount !== 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <Select
            value={selectedStatus ?? ''}
            onValueChange={(v) => setSelectedStatus(v as ContactStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o novo status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ContactStatus.OPT_IN}>Opt-in</SelectItem>
              <SelectItem value={ContactStatus.OPT_OUT}>Opt-out</SelectItem>
              <SelectItem value={ContactStatus.UNKNOWN}>Desconhecido</SelectItem>
              {/* ContactStatus.SUPPRESSED é gerenciado internamente e não exposto ao usuário */}
            </SelectContent>
          </Select>

          <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm transition-opacity ${
            selectedStatus
              ? 'border-primary-500/30 bg-zinc-900/60 text-primary-600 dark:text-primary-400 opacity-100'
              : 'opacity-0 pointer-events-none border-transparent'
          }`}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Isso vai <strong>substituir</strong> o status atual de{' '}
              <strong>{selectedCount} contato{selectedCount !== 1 ? 's' : ''}</strong>.
              Esta ação não pode ser desfeita.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={!selectedStatus || isLoading}>
            {isLoading ? 'Aplicando...' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
