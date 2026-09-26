import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, MessageCircle, ShieldCheck, Star } from 'lucide-react';

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="container-page py-8 sm:py-14">
      <div className="mx-auto grid max-w-5xl items-start gap-10 lg:grid-cols-[1fr_24rem]">
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <h1 className="text-balance text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="mt-2 text-ink-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        <aside className="hidden lg:block">{aside ?? <Perks />}</aside>
      </div>
    </div>
  );
}

function Perks() {
  const items = [
    { icon: <MessageCircle className="h-5 w-5" />, title: 'Contacto directo', text: 'Escríbele por WhatsApp o llámalo, sin intermediarios ni comisiones.' },
    { icon: <Star className="h-5 w-5" />, title: 'Reseñas reales', text: 'Solo opina quien contactó al profesional por la plataforma.' },
    { icon: <ShieldCheck className="h-5 w-5" />, title: 'Tus datos, protegidos', text: 'Tu teléfono solo lo ve quien tú decidas.' },
  ];
  return (
    <div className="rounded-3xl bg-ink-950 p-8 text-ink-200">
      <p className="eyebrow text-amber-300">Oficios Cuba</p>
      <p className="mt-3 font-display text-2xl font-bold leading-snug text-white">El oficio que buscas, en tu mismo municipio.</p>
      <ul className="mt-8 space-y-6">
        {items.map((i) => (
          <li key={i.title} className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300">{i.icon}</span>
            <div>
              <p className="font-semibold text-white">{i.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-300">{i.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean; describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className={invalid ? 'input input-error pr-12' : 'input pr-12'}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-400 hover:text-ink-700"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

/** Evita redirecciones abiertas: solo rutas internas. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}
