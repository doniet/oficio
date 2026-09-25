import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { Modal, Spinner, cn } from '../../components/ui';
import { parseDate } from '../../lib/format';
import type { AppointmentStatus } from '../../types';

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

export function PlanLock({ plan, children }: { plan: 'Básico' | 'Profesional'; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-sand-300 bg-sand-50 p-4 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
        <span>{children} <span className="font-semibold text-ink-800">Disponible desde el plan {plan}.</span></span>
      </p>
      <Link to="/dashboard/suscripcion" className="btn-secondary btn-sm shrink-0 self-start sm:self-auto">
        <Sparkles className="h-4 w-4" /> Ver planes
      </Link>
    </div>
  );
}

const CITA_ESTADO: Record<AppointmentStatus, { label: string; cls: string }> = {
  pending: { label: 'Por confirmar', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmada', cls: 'bg-sea-100 text-sea-800' },
  cancelled: { label: 'Cancelada', cls: 'bg-sand-200 text-ink-500' },
  done: { label: 'Hecha', cls: 'bg-ink-900 text-white' },
};

export function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  return <span className={cn('badge', CITA_ESTADO[status].cls)}>{CITA_ESTADO[status].label}</span>;
}

export const citaFecha = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
export const citaHora = (iso: string) =>
  parseDate(iso).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });
