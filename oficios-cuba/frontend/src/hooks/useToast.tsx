import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

type Tone = 'success' | 'error';
interface Toast { id: number; tone: Tone; text: string }

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback((text: string, tone: Tone = 'success') => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lift"
          >
            {t.tone === 'success'
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sea-300" />
              : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />}
            <p className="flex-1 leading-snug">{t.text}</p>
            <button onClick={() => dismiss(t.id)} className="-m-1 rounded-lg p-1 text-ink-300 hover:text-white" aria-label="Cerrar aviso">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
