import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
  loading?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  requireReason = false,
  reasonLabel,
  reasonPlaceholder,
  defaultReason = '',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (open) setReason(defaultReason);
  }, [open, defaultReason]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                variant === 'destructive' ? 'bg-red-50 text-[#DC2626]' : 'bg-[#FAF9F6] text-[#B91C1C]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
              <p className="text-xs text-[#57534E] mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="text-[#78716C] hover:text-[#0F172A] p-1 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {requireReason && (
          <div className="space-y-1.5">
            {reasonLabel && <label className="block text-xs font-medium text-[#0F172A]">{reasonLabel}</label>}
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={loading || (requireReason && !reason.trim())}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
          >
            {loading ? '...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
