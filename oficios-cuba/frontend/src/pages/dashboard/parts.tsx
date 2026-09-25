import type { ReactNode } from 'react';
import { Modal, Spinner, cn } from '../../components/ui';

// Miniatura para listas del panel: CategoryCover es para portadas grandes (emoji de 5xl).
export function ServiceThumb({ src, icon, className = '' }: { src?: string | null; icon?: string | null; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sand-100', className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span className="text-2xl" aria-hidden="true">{icon || '🛠️'}</span>
      )}
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy, danger = true, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; busy?: boolean; danger?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="text-sm text-ink-600">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={onConfirm} disabled={busy} className={danger ? 'btn-danger' : 'btn-primary'}>
          {busy && <Spinner className="h-4 w-4" />} {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}
