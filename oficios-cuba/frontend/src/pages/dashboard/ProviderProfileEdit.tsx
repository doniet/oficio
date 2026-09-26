import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ExternalLink, ImagePlus, MapPin, Phone, Store, Trash2, Wrench, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';
import { apiError, authApi, providerApi, provinceApi } from '../../services/api';
import { uploadImage } from '../../lib/image';
import type { ContactMode, Municipality, MyProviderProfile, PlanLimits, Province, ProviderKind, ServiceArea } from '../../types';
import { PageTitle } from '../../components/DashboardLayout';
import MapPointPicker, { type Punto } from '../../components/MapPointPicker';
import { Alert, Avatar, ErrorState, Field, PageLoader, Spinner, cn } from '../../components/ui';
import { FormSection, PlanLock } from './parts';

const MAX_AREAS = 60;

interface FormState {
  business_name: string;
  description: string;
  years_experience: string;
  province_id: string;
  municipality_id: string;
  address: string;
  whatsapp: string;
  telegram: string;
  email_contact: string;
  contact_mode: ContactMode;
  kind: ProviderKind;
  horario: string;
  show_on_map: boolean;
}

const CONTACT_MODES: { value: ContactMode; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Llamada' },
  { value: 'both', label: 'Ambos' },
];

type AreaMap = Map<string, { name: string; province: string }>;

function toForm(p: MyProviderProfile): FormState {
  return {
    business_name: p.business_name ?? '',
    description: p.description ?? '',
    years_experience: String(p.years_experience ?? 0),
    province_id: p.province_id ?? '',
    municipality_id: p.municipality_id ?? '',
    address: p.address ?? '',
    whatsapp: p.whatsapp ?? '',
    telegram: p.telegram ?? '',
    email_contact: p.email_contact ?? '',
    contact_mode: p.contact_mode ?? 'whatsapp',
    kind: p.kind ?? 'oficio',
    horario: p.horario ?? '',
    show_on_map: Boolean(p.show_on_map),
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.business_name.trim() && f.business_name.trim().length < 2) e.business_name = 'El nombre es muy corto';
  if (!f.province_id) e.province_id = 'Elige tu provincia';
  const years = Number(f.years_experience);
  if (f.years_experience !== '' && (!Number.isInteger(years) || years < 0 || years > 70)) e.years_experience = 'Entre 0 y 70 años';
  if (!f.whatsapp.trim()) e.whatsapp = 'Pon un teléfono para que los clientes te contacten';
  else if (!/^\+?[\d\s-]{8,20}$/.test(f.whatsapp.trim())) e.whatsapp = 'Usa solo números, con el prefijo del país (ej.: +53 5 123 4567)';
  if (f.email_contact.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email_contact.trim())) e.email_contact = 'Email no válido';
  return e;
}

function useMunicipalities(provinceId: string) {
  const [list, setList] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!provinceId) { setList([]); return; }
    let cancelled = false;
    setLoading(true);
    provinceApi.getMunicipalities(provinceId)
      .then((r) => { if (!cancelled) setList(r.data.municipalities); })
      .catch(() => { if (!cancelled) setList([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [provinceId]);
  return { list, loading };
}

export default function ProviderProfileEdit() {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const logoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);
  const [point, setPoint] = useState<Punto | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [logoBusy, setLogoBusy] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [areas, setAreas] = useState<AreaMap>(new Map());
  const [areaProvince, setAreaProvince] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [p, prov] = await Promise.all([providerApi.getMyProfile(), provinceApi.getAll()]);
      const prof: MyProviderProfile = p.data.provider;
      setProfile(prof);
      setForm(toForm(prof));
      setLimits(p.data.limits);
      setPoint(prof.lat != null && prof.lng != null ? { lat: prof.lat, lng: prof.lng } : null);
      setGallery(prof.gallery ?? []);
      setProvinces(prov.data.provinces);
      setAreas(new Map((p.data.serviceAreas as ServiceArea[]).map((a) => [a.municipality_id, { name: a.municipality_name, province: a.province_name }])));
      setAreaProvince(prof.province_id ?? '');
    } catch (err) {
      setLoadError(apiError(err, 'No se pudo cargar tu perfil.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const homeMunis = useMunicipalities(form?.province_id ?? '');
  const areaMunis = useMunicipalities(areaProvince);
  const areaProvinceName = useMemo(() => provinces.find((p) => p.id === areaProvince)?.name ?? '', [provinces, areaProvince]);

  const fallbackCenter = useMemo(() => {
    const muni = homeMunis.list.find((m) => m.id === form?.municipality_id);
    if (muni) return { lat: muni.lat, lng: muni.lng, zoom: 13 };
    const prov = provinces.find((p) => p.id === form?.province_id);
    return prov ? { lat: prov.lat, lng: prov.lng, zoom: Math.max(prov.zoom, 9) } : null;
  }, [homeMunis.list, provinces, form?.municipality_id, form?.province_id]);

  if (loading) return <PageLoader />;
  if (loadError || !form || !profile || !limits || !user) return <ErrorState message={loadError || 'Perfil no encontrado'} onRetry={load} />;

  const hasPhotos = limits.maxPhotos > 0;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleArea = (m: Municipality) => {
    setAreas((prev) => {
      const next = new Map(prev);
      if (next.has(m.id)) next.delete(m.id);
      else if (next.size < MAX_AREAS) next.set(m.id, { name: m.name, province: areaProvinceName });
      else toast(`Puedes marcar hasta ${MAX_AREAS} municipios.`, 'error');
      return next;
    });
  };

  const allSelected = areaMunis.list.length > 0 && areaMunis.list.every((m) => areas.has(m.id));
  const toggleAllInProvince = () => {
    setAreas((prev) => {
      const next = new Map(prev);
      if (allSelected) areaMunis.list.forEach((m) => next.delete(m.id));
      else {
        for (const m of areaMunis.list) {
          if (next.size >= MAX_AREAS) break;
          next.set(m.id, { name: m.name, province: areaProvinceName });
        }
      }
      return next;
    });
  };

  const removeArea = (id: string) => setAreas((prev) => {
    const next = new Map(prev);
    next.delete(id);
    return next;
  });

  const onLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoBusy(true);
    try {
      const url = await uploadImage(file, 600);
      const res = await authApi.updateProfile({ avatar_url: url });
      updateUser({ avatar_url: res.data.user.avatar_url ?? null });
      toast('Logo actualizado');
    } catch (err) {
      toast(err instanceof Error && !('isAxiosError' in err) ? err.message : apiError(err, 'No se pudo subir el logo.'), 'error');
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const res = await authApi.updateProfile({ avatar_url: '' });
      updateUser({ avatar_url: res.data.user.avatar_url ?? null });
    } catch (err) {
      toast(apiError(err, 'No se pudo quitar el logo.'), 'error');
    } finally {
      setLogoBusy(false);
    }
  };

  const onGalleryFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = limits.maxPhotos - gallery.length - uploading;
    if (room <= 0) return;
    const batch = files.slice(0, room);
    if (files.length > room) toast(`Tu plan permite ${limits.maxPhotos} fotos: se subirán ${room}.`, 'error');
    setUploading((n) => n + batch.length);
    for (const file of batch) {
      try {
        const url = await uploadImage(file);
        setGallery((g) => [...g, url].slice(0, limits.maxPhotos));
      } catch (err) {
        toast(err instanceof Error && !('isAxiosError' in err) ? err.message : apiError(err, 'No se pudo subir una foto.'), 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    try {
      const res = await providerApi.updateMyProfile({
        business_name: form.business_name.trim(),
        description: form.description.trim(),
        years_experience: form.years_experience === '' ? 0 : Number(form.years_experience),
        province_id: form.province_id,
        municipality_id: form.municipality_id,
        address: form.address.trim(),
        lat: point?.lat,
        lng: point?.lng,
        show_on_map: Boolean(point) && form.show_on_map,
        whatsapp: form.whatsapp.trim(),
        contact_mode: form.contact_mode,
        kind: limits.negocio ? form.kind : 'oficio',
        horario: form.kind === 'negocio' ? form.horario.trim() : '',
        gallery: hasPhotos ? gallery : undefined,
        telegram: form.telegram.trim().replace(/^@/, ''),
        email_contact: form.email_contact.trim(),
        service_area_ids: [...areas.keys()],
      });
      setProfile((p) => (p ? { ...p, ...res.data.provider } : p));
      setLimits(res.data.limits);
      toast('Perfil actualizado');
    } catch (err) {
      setSubmitError(apiError(err, 'No se pudo guardar tu perfil.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const sortedAreas = [...areas.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));

  return (
    <div className="max-w-3xl">
      <PageTitle
        title="Perfil profesional"
        subtitle="Esto es lo que ven los clientes antes de escribirte."
        action={<Link to={`/proveedor/${profile.id}`} className="btn-secondary"><ExternalLink className="h-4 w-4" /> Ver perfil público</Link>}
      />

      <form onSubmit={submit} noValidate className="space-y-5">
        {submitError && <Alert>{submitError}</Alert>}

        <FormSection title={form.kind === 'negocio' ? 'Tu negocio' : 'Tu oficio'}>
          {limits.negocio ? (
            <fieldset>
              <legend className="label">¿Qué registras?</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de perfil">
                {([['oficio', 'Un oficio', Wrench], ['negocio', 'Un negocio', Store]] as const).map(([value, label, Icon]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.kind === value}
                    onClick={() => set('kind', value)} className={cn('chip justify-center', form.kind === value && 'chip-active')}>
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <PlanLock plan="Profesional">Registra tu negocio (con horario), no solo tu oficio.</PlanLock>
          )}

          <Field label={form.kind === 'negocio' ? 'Nombre del negocio' : 'Nombre'} htmlFor="bn" error={errors.business_name} hint="Si lo dejas vacío, se mostrará tu nombre personal.">
            <input id="bn" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} maxLength={80}
              className={cn('input', errors.business_name && 'input-error')} aria-invalid={Boolean(errors.business_name)} />
          </Field>

          <div>
            <p className="label">Logo</p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar src={user.avatar_url} name={form.business_name || user.full_name} size="lg" square />
                {logoBusy && <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70"><Spinner /></span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => logoRef.current?.click()} disabled={logoBusy} className="btn-secondary btn-sm">
                  <Camera className="h-4 w-4" /> {user.avatar_url ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {user.avatar_url && (
                  <button type="button" onClick={removeLogo} disabled={logoBusy} className="btn-ghost btn-sm text-red-600 hover:bg-red-50">Quitar</button>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onLogo} className="hidden" />
            </div>
          </div>

          <Field label={form.kind === 'negocio' ? 'Sobre tu negocio' : 'Descripción de tu oficio'} htmlFor="desc" hint={`${form.description.length}/2000 · Tu experiencia, especialidades y qué te diferencia.`}>
            <textarea id="desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} rows={5} className="input resize-y" />
          </Field>

          {limits.negocio && form.kind === 'negocio' && (
            <Field label="Horario" htmlFor="horario" hint="Ej.: Lunes a sábado, 9:00 a. m. – 6:00 p. m.">
              <input id="horario" value={form.horario} onChange={(e) => set('horario', e.target.value)} maxLength={120} className="input" />
            </Field>
          )}

          {hasPhotos && (
            <Field label="Años de experiencia" htmlFor="years" error={errors.years_experience}>
              <input id="years" type="number" inputMode="numeric" min={0} max={70} value={form.years_experience}
                onChange={(e) => set('years_experience', e.target.value)}
                className={cn('input max-w-[10rem]', errors.years_experience && 'input-error')} aria-invalid={Boolean(errors.years_experience)} />
            </Field>
          )}
        </FormSection>

        <FormSection title="Contacto" description="Los clientes te contactan directo por este teléfono. Es público.">
          <Field label="Teléfono de contacto" htmlFor="wa" error={errors.whatsapp} hint="Con prefijo del país, ej.: +53 5 123 4567">
            <input id="wa" type="tel" inputMode="tel" autoComplete="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)}
              className={cn('input', errors.whatsapp && 'input-error')} aria-invalid={Boolean(errors.whatsapp)} />
          </Field>
          <fieldset>
            <legend className="label">¿Cómo te contactan?</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de contacto">
              {CONTACT_MODES.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={form.contact_mode === m.value}
                  onClick={() => set('contact_mode', m.value)} className={cn('chip justify-center', form.contact_mode === m.value && 'chip-active')}>
                  {m.value === 'call' ? <Phone className="h-4 w-4" /> : null} {m.label}
                </button>
              ))}
            </div>
          </fieldset>
          {hasPhotos ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telegram (opcional)" htmlFor="tg" hint="Tu usuario, sin @">
                <input id="tg" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} maxLength={40} className="input" autoCapitalize="none" />
              </Field>
              <Field label="Email de contacto (opcional)" htmlFor="em" error={errors.email_contact}>
                <input id="em" type="email" inputMode="email" value={form.email_contact} onChange={(e) => set('email_contact', e.target.value)}
                  className={cn('input', errors.email_contact && 'input-error')} aria-invalid={Boolean(errors.email_contact)} autoCapitalize="none" />
              </Field>
            </div>
          ) : null}
          {!limits.chat && (
            <p className="text-xs text-ink-400">El chat interno con los clientes es del plan Profesional.</p>
          )}
        </FormSection>

        <FormSection title="Ubicación">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provincia" htmlFor="prov" error={errors.province_id}>
              <select id="prov" value={form.province_id}
                onChange={(e) => { set('province_id', e.target.value); set('municipality_id', ''); }}
                className={cn('input', errors.province_id && 'input-error')} aria-invalid={Boolean(errors.province_id)}>
                <option value="">Elige…</option>
                {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Municipio" htmlFor="muni">
              <select id="muni" value={form.municipality_id} onChange={(e) => set('municipality_id', e.target.value)}
                disabled={!form.province_id || homeMunis.loading} className="input">
                <option value="">{homeMunis.loading ? 'Cargando…' : 'Elige…'}</option>
                {homeMunis.list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Dirección (opcional)" htmlFor="addr" hint="Solo si atiendes en un local. No pongas tu dirección particular si trabajas a domicilio.">
            <input id="addr" value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={200} className="input" />
          </Field>
          <div>
            <p className="label">Punto en el mapa (opcional)</p>
            <MapPointPicker value={point} onChange={setPoint} fallbackCenter={fallbackCenter} />
          </div>
          <label className={cn('flex items-start gap-3 text-sm', !point && 'opacity-50')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={Boolean(point) && form.show_on_map}
              disabled={!point} onChange={(e) => set('show_on_map', e.target.checked)} />
            <span>
              <span className="font-semibold text-ink-800">Mostrar mi ubicación en el mapa público</span>
              <span className="block text-ink-500">Los clientes verán el punto en tu perfil. Si no lo marcas, solo se usa tu municipio.</span>
            </span>
          </label>
        </FormSection>

        <FormSection title="Fotos del negocio" description={hasPhotos ? 'Fotos de tu local y de trabajos reales. La primera es la portada de tu perfil.' : undefined}>
          {hasPhotos ? (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((url, i) => (
                  <li key={url} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100">
                    <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 && <span className="badge absolute left-2 top-2 bg-ink-900/80 text-white">Portada</span>}
                    <button type="button" onClick={() => setGallery((g) => g.filter((x) => x !== url))}
                      className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-sm hover:bg-red-50" aria-label={`Quitar la foto ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <li key={`up-${i}`} className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-sand-100 text-ink-400" role="status" aria-label="Subiendo foto">
                    <Spinner className="h-6 w-6" />
                  </li>
                ))}
                {gallery.length + uploading < limits.maxPhotos && (
                  <li>
                    <button type="button" onClick={() => galleryRef.current?.click()}
                      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-sand-300 text-sm font-semibold text-ink-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
                      <ImagePlus className="h-6 w-6" /> Añadir fotos
                    </button>
                  </li>
                )}
              </ul>
              <p className="text-xs text-ink-400">{gallery.length} / {limits.maxPhotos} fotos</p>
              <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onGalleryFiles} className="hidden" />
            </>
          ) : (
            <PlanLock plan="Básico">Sube hasta 10 fotos de tu negocio y de tus trabajos.</PlanLock>
          )}
        </FormSection>

        {hasPhotos && <FormSection title="Zonas donde trabajas" description="Marca los municipios a los que te desplazas. Aparecerás en las búsquedas de esas zonas.">
          {sortedAreas.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Municipios seleccionados">
              {sortedAreas.map(([id, a]) => (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-sea-100 py-1 pl-3 pr-1 text-sm font-medium text-sea-900">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {a.name}
                  {a.province && a.province !== areaProvinceName && <span className="text-sea-700/70">· {a.province}</span>}
                  <button type="button" onClick={() => removeArea(id)} className="ml-0.5 rounded-full p-1 hover:bg-sea-200" aria-label={`Quitar ${a.name}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">Aún no has marcado zonas.</p>
          )}

          <div className="rounded-2xl border border-sand-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Añadir municipios de" htmlFor="areaprov">
                <select id="areaprov" value={areaProvince} onChange={(e) => setAreaProvince(e.target.value)} className="input sm:w-64">
                  <option value="">Elige una provincia…</option>
                  {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              {areaMunis.list.length > 0 && (
                <button type="button" onClick={toggleAllInProvince} className="btn-ghost btn-sm self-start sm:self-auto">
                  {allSelected ? 'Quitar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            {areaMunis.loading ? (
              <div className="py-4 text-ink-400"><Spinner /></div>
            ) : areaMunis.list.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {areaMunis.list.map((m) => (
                  <button key={m.id} type="button" onClick={() => toggleArea(m)} aria-pressed={areas.has(m.id)}
                    className={cn('chip', areas.has(m.id) && 'chip-active')}>
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-ink-400">{areas.size}/{MAX_AREAS} municipios</p>
        </FormSection>}

        <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl border border-sand-200 bg-white/95 p-3 shadow-lift backdrop-blur md:bottom-4">
          <button type="submit" disabled={saving || uploading > 0} className="btn-primary w-full sm:w-auto">
            {saving && <Spinner className="h-4 w-4" />} {uploading > 0 ? 'Subiendo fotos…' : 'Guardar perfil'}
          </button>
        </div>
      </form>
    </div>
  );
}
