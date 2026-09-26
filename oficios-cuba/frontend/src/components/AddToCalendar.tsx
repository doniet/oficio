import { CalendarPlus, ExternalLink } from 'lucide-react';
import { descargarIcs, enlaceGoogleCalendar, type EventoCalendario } from '../lib/cuba';
import { cn } from './ui';

/** Guardar la cita en el calendario del teléfono (.ics con avisos) o en Google Calendar. Todo en el navegador. */
export default function AddToCalendar({ evento, className = '', compact = false }: { evento: EventoCalendario; className?: string; compact?: boolean }) {
  const size = compact ? 'btn-sm' : '';
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <button type="button" onClick={() => descargarIcs(evento)} className={cn('btn-secondary flex-1', size)}>
        <CalendarPlus className="h-4 w-4" /> {compact ? 'Al calendario' : 'Añadir a mi calendario'}
      </button>
      <a href={enlaceGoogleCalendar(evento)} target="_blank" rel="noopener noreferrer" className={cn('btn-ghost flex-1', size)}>
        <ExternalLink className="h-4 w-4" /> Google Calendar
      </a>
    </div>
  );
}

export function eventoDeCita(c: { id: string; starts_at: string; ends_at: string; provider_name: string; service_title?: string | null; note?: string | null }): EventoCalendario {
  return {
    id: c.id,
    titulo: `Cita con ${c.provider_name}${c.service_title ? ` · ${c.service_title}` : ''}`,
    inicio: c.starts_at,
    fin: c.ends_at,
    detalle: [c.note, 'Gestiona tu cita en https://oficio.dardoit.com/dashboard/citas'].filter(Boolean).join('\n\n'),
  };
}
