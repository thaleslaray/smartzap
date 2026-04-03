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
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { X, Plus, Tag } from 'lucide-react'

interface ContactBulkTagsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  availableTags: string[]
  onApply: (tagsToAdd: string[], tagsToRemove: string[]) => void
  isLoading?: boolean
}

export function ContactBulkTagsModal({
  open,
  onOpenChange,
  selectedCount,
  availableTags,
  onApply,
  isLoading,
}: ContactBulkTagsModalProps) {
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([])
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([])
  const [addInput, setAddInput] = useState('')

  const handleAddTag = (tag: string) => {
    const t = tag.trim().toLowerCase()
    if (!t || tagsToAdd.includes(t)) return
    setTagsToAdd((prev) => [...prev, t])
    setAddInput('')
  }

  const handleClose = () => {
    setTagsToAdd([])
    setTagsToRemove([])
    setAddInput('')
    onOpenChange(false)
  }

  const handleApply = () => {
    onApply(tagsToAdd, tagsToRemove)
    setTagsToAdd([])
    setTagsToRemove([])
    setAddInput('')
  }

  const hasChanges = tagsToAdd.length > 0 || tagsToRemove.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag size={18} />
            Editar tags — {selectedCount} contato{selectedCount !== 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Adicionar tags */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--ds-text-secondary)]">Adicionar</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag..."
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag(addInput)}
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => handleAddTag(addInput)} aria-label="Adicionar tag">
                <Plus size={14} />
              </Button>
            </div>
            {tagsToAdd.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tagsToAdd.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-xs">
                    {t}
                    <button onClick={() => setTagsToAdd((p) => p.filter((x) => x !== t))} aria-label={`Remover tag ${t}`}>
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Remover tags */}
          {availableTags.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--ds-text-secondary)]">Remover</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags
                  .filter((t) => !tagsToRemove.includes(t))
                  .map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="cursor-pointer hover:bg-destructive/10 hover:border-destructive/30 text-xs"
                      onClick={() => setTagsToRemove((prev) => [...prev, t])}
                    >
                      {t}
                    </Badge>
                  ))}
              </div>
              {tagsToRemove.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tagsToRemove.map((t) => (
                    <Badge key={t} variant="destructive" className="gap-1 text-xs">
                      {t}
                      <button onClick={() => setTagsToRemove((p) => p.filter((x) => x !== t))} aria-label={`Desfazer remoção da tag ${t}`}>
                        <X size={10} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={!hasChanges || isLoading}>
            {isLoading ? 'Aplicando...' : `Aplicar${hasChanges ? ` (${tagsToAdd.length + tagsToRemove.length})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
