import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Lock, Sparkles, Star, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, categoryApi, serviceApi, type ServiceInput } from '../../services/api';
import { uploadImage } from '../../lib/image';
import { planLabel, priceParts, priceTypeLabel } from '../../lib/format';
import { useTasa } from '../../hooks/useTasa';
import type { Category, Currency, Plan, PriceType } from '../../types';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, EmptyState, ErrorState, Field, PageLoader, Spinner, cn } from '../../components/ui';
import { FormSection, PlanLock } from './parts';

const MAX_IMAGES = 6;
const PRICE_TYPES: PriceType[] = ['fixed', 'hourly', 'daily', 'negotiable'];

interface FormState {
  parent_id: string;
  category_id: string;
  title: string;
  description: string;
  price_type: PriceType;
  price_min: string;
  price_max: string;
  price_currency: Currency;
  images: string[];
  duration_min: string;
}

const EMPTY: FormState = { parent_id: '', category_id: '', title: '', description: '', price_type: 'fixed', price_min: '', price_max: '', price_currency: 'CUP', images: [], duration_min: '' };

const DURACIONES: [number, string][] = [
  [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30 min'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [360, '6 h'], [480, '8 h'],
];

type Errors = Partial<Record<'category' | 'title' | 'price', string>>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.category_id) e.category = 'Elige la categoría de tu servicio';
  if (f.title.trim().length < 5) e.title = 'El título debe tener al menos 5 caracteres';
  if (f.price_type !== 'negotiable') {
    const min = f.price_min === '' ? null : Number(f.price_min);
    const max = f.price_max === '' ? null : Number(f.price_max);
    if (min == null && max == null) e.price = 'Indica al menos un precio o elige “A convenir”';
    else if ((min != null && (Number.isNaN(min) || min < 0)) || (max != null && (Number.isNaN(max) || max < 0))) e.price = 'Los precios deben ser números positivos';
    else if (min != null && max != null && max < min) e.price = 'El precio máximo no puede ser menor que el mínimo';
  }
  return e;
}

export default function ServiceForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const tasa = useTasa();
  const [photosAllowed, setPhotosAllowed] = useState(true);
  const [hasAgenda, setHasAgenda] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [limit, setLimit] = useState<{ plan: Plan; max: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [cats, mine, detail] = await Promise.all([
        categoryApi.getAll(),
        serviceApi.mine(),
        isEdit ? serviceApi.getById(id!) : Promise.resolve(null),
      ]);
      setPhotosAllowed(mine.data.photos_allowed !== false);
      setHasAgenda(mine.data.plan === 'pro');
      const extra = detail ?? mine;
      const list: Category[] = cats.data.categories;
      setCategories(list);

      if (isEdit) {
        const s = extra.data.service;
        if (!s.is_owner) throw new Error('not-owner');
        const parent = list.find((c) => c.id === s.category_id || c.subcategories?.some((sc) => sc.id === s.category_id));
        setForm({
          parent_id: parent?.id ?? '',
          category_id: s.category_id,
          title: s.title,
          description: s.description ?? '',
          price_type: s.price_type,
          price_min: s.price_min != null ? String(s.price_min) : '',
          price_max: s.price_max != null ? String(s.price_max) : '',
          price_currency: s.price_currency ?? 'CUP',
          images: s.images ?? [],
          duration_min: s.duration_min != null ? String(s.duration_min) : '',
        });
      } else {
        const { services, plan, max_services } = extra.data;
        setLimit(max_services !== null && services.length >= max_services ? { plan, max: max_services } : null);
      }
    } catch (err) {
      setLoadError(err instanceof Error && err.message === 'not-owner'
        ? 'Este servicio no es tuyo.'
        : apiError(err, 'No se pudo cargar el formulario.'));
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const parent = categories.find((c) => c.id === form.parent_id);
  const subs = parent?.subcategories ?? [];

  const chooseParent = (pid: string) => {
    const p = categories.find((c) => c.id === pid);
    // Si la categoría no tiene subcategorías, el servicio se clasifica directamente en ella.
    setForm((f) => ({ ...f, parent_id: pid, category_id: p && !p.subcategories?.length ? p.id : '' }));
    setErrors((e) => ({ ...e, category: undefined }));
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_IMAGES - form.images.length - uploading;
    if (room <= 0) return;
    const batch = files.slice(0, room);
    if (files.length > room) toast(`Solo caben ${MAX_IMAGES} fotos por servicio: se subirán ${room}.`, 'error');
    setUploading((n) => n + batch.length);
    for (const file of batch) {
      try {
        const url = await uploadImage(file);
        setForm((f) => ({ ...f, images: [...f.images, url].slice(0, MAX_IMAGES) }));
      } catch (err) {
        toast(err instanceof Error && !('isAxiosError' in err) ? err.message : apiError(err, 'No se pudo subir una foto.'), 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeImage = (url: string) => set('images', form.images.filter((x) => x !== url));
  const makeCover = (url: string) => set('images', [url, ...form.images.filter((x) => x !== url)]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const negotiable = form.price_type === 'negotiable';
    const payload: ServiceInput = {
      category_id: form.category_id,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      price_type: form.price_type,
      price_min: negotiable || form.price_min === '' ? null : Number(form.price_min),
      price_max: negotiable || form.price_max === '' ? null : Number(form.price_max),
      price_currency: form.price_currency,
      images: form.images,
      duration_min: form.duration_min === '' ? null : Number(form.duration_min),
    };
    setSaving(true);
    try {
      if (isEdit) {
        await serviceApi.update(id!, payload);
        toast('Cambios guardados');
      } else {
        await serviceApi.create(payload);
        toast('¡Oficio publicado!');
      }
      navigate('/dashboard/servicios');
    } catch (err) {
      setSubmitError(apiError(err, 'No se pudo guardar el servicio.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <Link to="/dashboard/servicios" className="link mb-3 inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="h-4 w-4" /> Mis oficios
    </Link>
  );

  if (loading) return <PageLoader />;
  if (loadError) return <div>{back}<ErrorState message={loadError} onRetry={load} /></div>;

  if (limit) {
    return (
      <div>
        {back}
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Llegaste al límite de tu plan"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/dashboard/suscripcion" className="btn-primary"><Sparkles className="h-4 w-4" /> Ver planes</Link>
              <Link to="/dashboard/servicios" className="btn-secondary">Gestionar mis servicios</Link>
            </div>
          }
        >
          Tu plan {planLabel[limit.plan]} permite {limit.max} {limit.max === 1 ? 'oficio' : 'oficios'} (contando los pausados).
          Mejora tu plan para publicar más, o elimina uno que ya no ofrezcas.
        </EmptyState>
      </div>
    );
  }

  const slots = form.images.length + uploading;
  const toNum = (v: string) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const preview = priceParts({ price_type: form.price_type, price_min: toNum(form.price_min), price_max: toNum(form.price_max), price_currency: form.price_currency }, tasa);

  return (
    <div className="max-w-3xl">
      {back}
      <PageTitle
        title={isEdit ? 'Editar oficio' : 'Publicar un oficio'}
        subtitle={isEdit ? 'Los cambios se ven al instante en tu anuncio.' : 'Un buen título, fotos reales y un precio claro atraen más clientes.'}
      />

      <form onSubmit={submit} noValidate className="space-y-5">
        {submitError && <Alert>{submitError}</Alert>}

        <FormSection title="¿Qué ofreces?">
          <Field label="Categoría" htmlFor="parent" error={!form.category_id && !subs.length ? errors.category : undefined}>
            <select
              id="parent"
              value={form.parent_id}
              onChange={(e) => chooseParent(e.target.value)}
              className={cn('input', errors.category && !form.parent_id && 'input-error')}
              aria-invalid={Boolean(errors.category && !form.parent_id)}
            >
              <option value="">Elige una categoría…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>

          {subs.length > 0 && (
            <fieldset>
              <legend className="label">Especialidad</legend>
              <div className="flex flex-wrap gap-2">
                {subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { set('category_id', s.id); setErrors((er) => ({ ...er, category: undefined })); }}
                    className={cn('chip', form.category_id === s.id && 'chip-active')}
                    aria-pressed={form.category_id === s.id}
                  >
                    {s.icon} {s.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set('category_id', parent!.id)}
                  className={cn('chip', form.category_id === parent!.id && 'chip-active')}
                  aria-pressed={form.category_id === parent!.id}
                >
                  Otro / general
                </button>
              </div>
              {errors.category && !form.category_id && <p className="mt-1 text-xs font-medium text-red-600">Elige una especialidad</p>}
            </fieldset>
          )}

          <Field label="Título del anuncio" htmlFor="title" error={errors.title} hint="Ej.: “Reparación de refrigeradores a domicilio”">
            <input
              id="title"
              value={form.title}
              onChange={(e) => { set('title', e.target.value); setErrors((er) => ({ ...er, title: undefined })); }}
              maxLength={100}
              className={cn('input', errors.title && 'input-error')}
              aria-invalid={Boolean(errors.title)}
            />
          </Field>

          <Field label="Descripción" htmlFor="description" hint={`${form.description.length}/3000 · Qué incluye, materiales, horarios, zonas, garantía…`}>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={3000}
              rows={6}
              className="input resize-y"
            />
          </Field>
        </FormSection>

        <FormSection title="Precio" description="Orientativo: el precio final lo acuerdas con el cliente.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de precio">
            {PRICE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={form.price_type === t}
                onClick={() => { set('price_type', t); setErrors((er) => ({ ...er, price: undefined })); }}
                className={cn('chip justify-center', form.price_type === t && 'chip-active')}
              >
                {priceTypeLabel[t]}
              </button>
            ))}
          </div>
          {form.price_type !== 'negotiable' && (
            <fieldset>
              <legend className="label">Moneda</legend>
              <div className="inline-grid grid-cols-2 gap-2" role="radiogroup" aria-label="Moneda del precio">
                {(['CUP', 'USD'] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={form.price_currency === c}
                    onClick={() => set('price_currency', c)} className={cn('chip justify-center px-5', form.price_currency === c && 'chip-active')}>
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {form.price_type !== 'negotiable' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Desde (${form.price_currency})`} htmlFor="pmin">
                <input id="pmin" type="number" inputMode="decimal" min={0} step={form.price_currency === 'CUP' ? '1' : '0.01'} value={form.price_min}
                  onChange={(e) => { set('price_min', e.target.value); setErrors((er) => ({ ...er, price: undefined })); }}
                  className={cn('input', errors.price && 'input-error')} aria-invalid={Boolean(errors.price)} />
              </Field>
              <Field label="Hasta (opcional)" htmlFor="pmax">
                <input id="pmax" type="number" inputMode="decimal" min={0} step={form.price_currency === 'CUP' ? '1' : '0.01'} value={form.price_max}
                  onChange={(e) => { set('price_max', e.target.value); setErrors((er) => ({ ...er, price: undefined })); }}
                  className={cn('input', errors.price && 'input-error')} />
              </Field>
            </div>
          )}
          {errors.price && <p className="text-xs font-medium text-red-600">{errors.price}</p>}
          {!preview.negotiable && (toNum(form.price_min) != null || toNum(form.price_max) != null) && (
            <p className="rounded-xl bg-sand-50 px-3 py-2 text-sm text-ink-600" aria-live="polite">
              Los clientes verán: <span className="font-semibold text-ink-900">{preview.main}{preview.suffix ? ` ${preview.suffix}` : ''}</span>{' '}
              <span className="text-ink-400">{preview.alt}</span>
              <span className="block text-xs text-ink-400">Conversión con la tasa informal de hoy: 1 USD = {tasa} CUP.</span>
            </p>
          )}
          {(hasAgenda || form.duration_min !== '') && (
            <Field label="Duración de la cita" htmlFor="dur" hint="Se usa en tu agenda para calcular los huecos libres cuando un cliente pide este servicio.">
              <select id="dur" value={form.duration_min} onChange={(e) => set('duration_min', e.target.value)} className="input">
                <option value="">La general de mi agenda</option>
                {DURACIONES.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
                {form.duration_min !== '' && !DURACIONES.some(([m]) => String(m) === form.duration_min) && (
                  <option value={form.duration_min}>{form.duration_min} min</option>
                )}
              </select>
            </Field>
          )}
        </FormSection>

        <FormSection title="Fotos" description={photosAllowed ? `Hasta ${MAX_IMAGES} fotos de trabajos reales. La primera es la portada. Las reducimos antes de subirlas para ahorrar datos.` : undefined}>
          {!photosAllowed && form.images.length === 0 ? (
            <PlanLock plan="Básico">Añade fotos de tus trabajos a cada oficio.</PlanLock>
          ) : (<>
          {!photosAllowed && <Alert tone="info">Tu plan actual no muestra fotos: las que ya tenías se conservan pero los clientes no las ven.</Alert>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {form.images.map((url, i) => (
              <li key={url} className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100">
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                {i === 0 && <span className="badge absolute left-2 top-2 bg-ink-900/80 text-white">Portada</span>}
                <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5">
                  {i > 0 && (
                    <button type="button" onClick={() => makeCover(url)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink-700 shadow-sm hover:text-amber-600" aria-label={`Usar la foto ${i + 1} como portada`}>
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => removeImage(url)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm hover:bg-red-50" aria-label={`Quitar la foto ${i + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <li key={`up-${i}`} className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-sand-100 text-ink-400" role="status" aria-label="Subiendo foto">
                <Spinner className="h-6 w-6" />
              </li>
            ))}
            {photosAllowed && slots < MAX_IMAGES && (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-sand-300 text-sm font-semibold text-ink-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                >
                  <ImagePlus className="h-6 w-6" />
                  Añadir fotos
                  <span className="text-xs font-normal text-ink-400">{form.images.length}/{MAX_IMAGES}</span>
                </button>
              </li>
            )}
          </ul>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onFiles} className="hidden" />
          </>)}
        </FormSection>

        <div className="sticky bottom-20 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-sand-200 bg-white/95 p-3 shadow-lift backdrop-blur sm:flex-row sm:justify-end md:bottom-4">
          <Link to="/dashboard/servicios" className="btn-secondary">Cancelar</Link>
          <button type="submit" disabled={saving || uploading > 0} className="btn-primary">
            {saving && <Spinner className="h-4 w-4" />}
            {uploading > 0 ? 'Subiendo fotos…' : isEdit ? 'Guardar cambios' : 'Publicar oficio'}
          </button>
        </div>
      </form>
    </div>
  );
}
