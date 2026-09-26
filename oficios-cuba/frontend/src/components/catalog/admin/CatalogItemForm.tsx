import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { apiError, catalogApi } from '../../../services/api';
import { uploadImage } from '../../../lib/image';
import type { CatalogInput, CatalogItem, CatalogPriceType, Currency } from '../../../types';
import { Alert, Field, Modal, Spinner, cn } from '../../ui';

const TIPOS: [CatalogPriceType, string][] = [['fixed', 'Fijo'], ['from', 'Desde'], ['ask', 'A consultar']];

interface Form {
  name: string;
  description: string;
  price_type: CatalogPriceType;
  price: string;
  price_currency: Currency;
  image: string | null;
  section: string;
  available: boolean;
}

const VACIO: Form = { name: '', description: '', price_type: 'fixed', price: '', price_currency: 'CUP', image: null, section: '', available: true };

function desdeItem(i: CatalogItem): Form {
  return {
    name: i.name, description: i.description ?? '', price_type: i.price_type, price: i.price == null ? '' : String(i.price),
    price_currency: i.price_currency, image: i.image, section: i.section ?? '', available: i.available,
  };
}

interface Props {
  open: boolean;
  /** null = alta. */
  item: CatalogItem | null;
  sections: string[];
  onClose: () => void;
  onSaved: (item: CatalogItem, esNuevo: boolean) => void;
}

export default function CatalogItemForm({ open, item, sections, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Form>(VACIO);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(item ? desdeItem(item) : VACIO);
    setError('');
  }, [open, item]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      set('image', await uploadImage(file, 800, 'catalog'));
    } catch (err) {
      setError(err instanceof Error && !('isAxiosError' in err) ? err.message : apiError(err, 'No se pudo subir la foto.'));
    } finally {
      setUploading(false);
    }
  };

  const guardar = async (otro: boolean) => {
    if (form.name.trim().length < 2) { setError('Escribe el nombre del artículo.'); return; }
    const precio = form.price === '' ? null : Number(form.price);
    if (form.price_type !== 'ask' && (precio === null || Number.isNaN(precio) || precio < 0)) { setError('Pon el precio o elige «A consultar».'); return; }
    const data: CatalogInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_type: form.price_type,
      price: form.price_type === 'ask' ? null : precio,
      price_currency: form.price_currency,
      image: form.image,
      section: form.section.trim() || null,
      available: form.available,
    };
    setSaving(true);
    setError('');
    try {
      const res = item ? await catalogApi.update(item.id, data) : await catalogApi.create(data);
      onSaved(res.data.item, !item);
      if (otro && !item) {
        // Conserva sección, moneda y tipo: al cargar muchos artículos seguidos suelen repetirse.
        setForm((f) => ({ ...VACIO, section: f.section, price_currency: f.price_currency, price_type: f.price_type }));
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(apiError(err, 'No se pudo guardar el artículo.'));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); guardar(false); };
  const ocupado = saving || uploading;

  return (
    <Modal open={open} onClose={ocupado ? () => {} : onClose} title={item ? 'Editar artículo' : 'Añadir artículo'} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <div className="flex items-start gap-4">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-sand-300 bg-sand-100">
            {uploading ? <Spinner /> : form.image ? (
              <img src={form.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-7 w-7 text-ink-300" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <p className="label mb-0">Foto <span className="font-normal text-ink-400">(opcional)</span></p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado} onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm">
                <ImagePlus className="h-4 w-4" /> {form.image ? 'Cambiar' : 'Subir foto'}
              </button>
              {form.image && (
                <button type="button" disabled={ocupado} onClick={() => set('image', null)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Quitar
                </button>
              )}
            </div>
            <p className="hint">Se reduce antes de subirla para ahorrar datos.</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
          </div>
        </div>

        <Field label="Nombre" htmlFor="ci-nombre">
          <input ref={nameRef} id="ci-nombre" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} className="input" placeholder="Ej.: Breaker 20 A" />
        </Field>

        <Field label="Descripción (opcional)" htmlFor="ci-desc" hint={`${form.description.length} / 1000`}>
          <textarea id="ci-desc" value={form.description} maxLength={1000} rows={3} onChange={(e) => set('description', e.target.value)} className="input resize-y" />
        </Field>

        <fieldset>
          <legend className="label">Precio</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de precio">
            {TIPOS.map(([t, label]) => (
              <button key={t} type="button" role="radio" aria-checked={form.price_type === t} onClick={() => set('price_type', t)}
                className={cn('chip justify-center', form.price_type === t && 'chip-active')}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {form.price_type !== 'ask' && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label={`Precio (${form.price_currency})`} htmlFor="ci-precio">
              <input id="ci-precio" type="number" inputMode="decimal" min={0} step={form.price_currency === 'CUP' ? '1' : '0.01'}
                value={form.price} onChange={(e) => set('price', e.target.value)} className="input" />
            </Field>
            <div className="inline-grid grid-cols-2 gap-2 pb-0.5" role="radiogroup" aria-label="Moneda del precio">
              {(['CUP', 'USD'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={form.price_currency === c} onClick={() => set('price_currency', c)}
                  className={cn('chip justify-center px-4', form.price_currency === c && 'chip-active')}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Sección (opcional)" htmlFor="ci-seccion" hint="Agrupa tu catálogo: «Bebidas», «Piezas», «Cortes»…">
          <input id="ci-seccion" list="ci-secciones" value={form.section} maxLength={40} onChange={(e) => set('section', e.target.value)} className="input" />
          <datalist id="ci-secciones">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>

        <label className="flex items-center gap-3">
          <span className="relative inline-flex">
            <input type="checkbox" className="peer sr-only" checked={form.available} onChange={(e) => set('available', e.target.checked)} />
            <span className="h-6 w-11 rounded-full bg-sand-300 transition peer-checked:bg-sea-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sea-500/40" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </span>
          <span className="text-sm font-semibold">{form.available ? 'Disponible' : 'Agotado'}</span>
        </label>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={ocupado} className="btn-ghost">Cancelar</button>
          {!item && (
            <button type="button" onClick={() => guardar(true)} disabled={ocupado} className="btn-secondary">Guardar y añadir otro</button>
          )}
          <button type="submit" disabled={ocupado} className="btn-primary">{saving && <Spinner className="h-4 w-4" />} Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
