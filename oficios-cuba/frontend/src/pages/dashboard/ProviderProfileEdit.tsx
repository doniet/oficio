import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MapPin, X } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, providerApi, provinceApi } from '../../services/api';
import type { Municipality, MyProviderProfile, Province, ServiceArea } from '../../types';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, ErrorState, Field, PageLoader, Spinner, cn } from '../../components/ui';
import { FormSection } from './parts';

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
}

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
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.business_name.trim() && f.business_name.trim().length < 2) e.business_name = 'El nombre es muy corto';
  if (!f.province_id) e.province_id = 'Elige tu provincia';
  const years = Number(f.years_experience);
  if (f.years_experience !== '' && (!Number.isInteger(years) || years < 0 || years > 70)) e.years_experience = 'Entre 0 y 70 años';
  if (f.whatsapp.trim() && !/^\+?[\d\s-]{8,20}$/.test(f.whatsapp.trim())) e.whatsapp = 'Usa solo números, con el prefijo del país (ej.: +53 5 123 4567)';
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
  const [profile, setProfile] = useState<MyProviderProfile | null>(null);
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

  if (loading) return <PageLoader />;
  if (loadError || !form || !profile) return <ErrorState message={loadError || 'Perfil no encontrado'} onRetry={load} />;

  const set = (key: keyof FormState, value: string) => {
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
        whatsapp: form.whatsapp.trim(),
        telegram: form.telegram.trim().replace(/^@/, ''),
        email_contact: form.email_contact.trim(),
        service_area_ids: [...areas.keys()],
      });
      setProfile((p) => (p ? { ...p, ...res.data.provider } : p));
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

        <FormSection title="Tu negocio">
          <Field label="Nombre del negocio" htmlFor="bn" error={errors.business_name} hint="Si lo dejas vacío, se mostrará tu nombre personal.">
            <input id="bn" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} maxLength={80}
              className={cn('input', errors.business_name && 'input-error')} aria-invalid={Boolean(errors.business_name)} />
          </Field>
          <Field label="Sobre tu trabajo" htmlFor="desc" hint={`${form.description.length}/2000 · Tu experiencia, especialidades y qué te diferencia.`}>
            <textarea id="desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} rows={5} className="input resize-y" />
          </Field>
          <Field label="Años de experiencia" htmlFor="years" error={errors.years_experience}>
            <input id="years" type="number" inputMode="numeric" min={0} max={70} value={form.years_experience}
              onChange={(e) => set('years_experience', e.target.value)}
              className={cn('input max-w-[10rem]', errors.years_experience && 'input-error')} aria-invalid={Boolean(errors.years_experience)} />
          </Field>
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
        </FormSection>

        <FormSection title="Contacto" description="Los clientes siempre pueden escribirte por el chat. Estos datos son opcionales y públicos.">
          <Field label="WhatsApp" htmlFor="wa" error={errors.whatsapp} hint="Con prefijo del país, ej.: +53 5 123 4567">
            <input id="wa" type="tel" inputMode="tel" autoComplete="tel" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)}
              className={cn('input', errors.whatsapp && 'input-error')} aria-invalid={Boolean(errors.whatsapp)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telegram" htmlFor="tg" hint="Tu usuario, sin @">
              <input id="tg" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} maxLength={40} className="input" autoCapitalize="none" />
            </Field>
            <Field label="Email de contacto" htmlFor="em" error={errors.email_contact}>
              <input id="em" type="email" inputMode="email" value={form.email_contact} onChange={(e) => set('email_contact', e.target.value)}
                className={cn('input', errors.email_contact && 'input-error')} aria-invalid={Boolean(errors.email_contact)} autoCapitalize="none" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Zonas donde trabajas" description="Marca los municipios a los que te desplazas. Aparecerás en las búsquedas de esas zonas.">
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
        </FormSection>

        <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl border border-sand-200 bg-white/95 p-3 shadow-lift backdrop-blur md:bottom-4">
          <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
            {saving && <Spinner className="h-4 w-4" />} Guardar perfil
          </button>
        </div>
      </form>
    </div>
  );
}
