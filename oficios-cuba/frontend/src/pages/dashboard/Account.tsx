import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Eye, EyeOff, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { GoogleMark } from '../../components/GoogleButton';
import { useToast } from '../../hooks/useToast';
import { apiError, authApi, tokenStore } from '../../services/api';
import { uploadImage } from '../../lib/image';
import { memberSince } from '../../lib/format';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, Avatar, Field, Spinner, cn } from '../../components/ui';
import { ConfirmDialog, FormSection } from './parts';
import TelegramAvisos from '../../components/TelegramAvisos';

function ProfileForm() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  if (!user) return null;
  // El endpoint de subida solo acepta cuentas de proveedor.
  const canUpload = user.user_type === 'provider';

  const saveAvatar = async (avatar_url: string) => {
    const res = await authApi.updateProfile({ avatar_url });
    updateUser({ avatar_url: res.data.user.avatar_url ?? null });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      await saveAvatar(await uploadImage(file, 600));
      toast('Foto actualizada');
    } catch (err) {
      toast(err instanceof Error && !('isAxiosError' in err) ? err.message : apiError(err, 'No se pudo subir la foto.'), 'error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      await saveAvatar('');
      toast('Foto eliminada');
    } catch (err) {
      toast(apiError(err, 'No se pudo quitar la foto.'), 'error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setNameError('Escribe tu nombre completo'); return; }
    setSaving(true);
    try {
      const res = await authApi.updateProfile({ full_name: name.trim(), phone: phone.trim() });
      updateUser({ full_name: res.data.user.full_name, phone: res.data.user.phone });
      toast('Datos guardados');
    } catch (err) {
      setError(apiError(err, 'No se pudieron guardar tus datos.'));
    } finally {
      setSaving(false);
    }
  };

  const dirty = name.trim() !== user.full_name || phone.trim() !== (user.phone ?? '');

  return (
    <FormSection title="Datos personales">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={user.avatar_url} name={user.full_name} size="xl" />
          {avatarBusy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70" role="status" aria-label="Actualizando foto">
              <Spinner className="h-6 w-6" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold">{user.full_name}</p>
          <p className="truncate text-sm text-ink-500">{user.email}</p>
          {user.created_at && <p className="text-xs text-ink-400">Miembro desde {memberSince(user.created_at)}</p>}
          {canUpload && (
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarBusy} className="btn-secondary btn-sm">
                <Camera className="h-4 w-4" /> {user.avatar_url ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {user.avatar_url && (
                <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="btn-ghost btn-sm text-red-600 hover:bg-red-50" aria-label="Quitar foto">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nombre completo" htmlFor="fullname" error={nameError}>
          <input id="fullname" value={name} autoComplete="name" maxLength={80}
            onChange={(e) => { setName(e.target.value); setNameError(''); }}
            className={cn('input', nameError && 'input-error')} aria-invalid={Boolean(nameError)} />
        </Field>
        <Field label="Teléfono" htmlFor="phone" hint="Opcional. No se muestra públicamente.">
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={20}
            onChange={(e) => setPhone(e.target.value)} className="input" />
        </Field>
        <Field label="Email" htmlFor="email" hint="El email de acceso no se puede cambiar.">
          <input id="email" value={user.email} readOnly disabled className="input bg-sand-100 text-ink-500" />
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !dirty} className="btn-primary">{saving && <Spinner className="h-4 w-4" />} Guardar datos</button>
        </div>
      </form>
    </FormSection>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const errs: typeof errors = {};
    if (!current) errs.current = 'Escribe tu contraseña actual';
    if (next.length < 8) errs.next = 'Mínimo 8 caracteres';
    else if (next === current) errs.next = 'Debe ser distinta de la actual';
    if (confirm !== next) errs.confirm = 'Las contraseñas no coinciden';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      // El backend invalida los tokens anteriores y devuelve uno nuevo para esta sesión.
      const res = await authApi.updatePassword({ current_password: current, new_password: next });
      if (res.data.token) tokenStore.set(res.data.token);
      toast('Contraseña actualizada');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(apiError(err, 'No se pudo cambiar la contraseña.'));
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <FormSection title="Contraseña">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Contraseña actual" htmlFor="curpw" error={errors.current}>
          <input id="curpw" type={type} autoComplete="current-password" value={current}
            onChange={(e) => { setCurrent(e.target.value); setErrors((x) => ({ ...x, current: undefined })); }}
            className={cn('input', errors.current && 'input-error')} aria-invalid={Boolean(errors.current)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nueva contraseña" htmlFor="newpw" error={errors.next} hint="Mínimo 8 caracteres">
            <input id="newpw" type={type} autoComplete="new-password" value={next}
              onChange={(e) => { setNext(e.target.value); setErrors((x) => ({ ...x, next: undefined })); }}
              className={cn('input', errors.next && 'input-error')} aria-invalid={Boolean(errors.next)} />
          </Field>
          <Field label="Repite la nueva" htmlFor="confpw" error={errors.confirm}>
            <input id="confpw" type={type} autoComplete="new-password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }}
              className={cn('input', errors.confirm && 'input-error')} aria-invalid={Boolean(errors.confirm)} />
          </Field>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setShow((s) => !s)} className="btn-ghost btn-sm self-start" aria-pressed={show}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {show ? 'Ocultar' : 'Mostrar'} contraseñas
          </button>
          <button type="submit" disabled={saving} className="btn-primary">{saving && <Spinner className="h-4 w-4" />} Cambiar contraseña</button>
        </div>
      </form>
    </FormSection>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const soloGoogle = user?.has_password === false;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="max-w-2xl space-y-5">
      <PageTitle title="Cuenta" subtitle="Tus datos de acceso y seguridad." />
      <ProfileForm />
      {soloGoogle ? (
        <section className="card flex items-center gap-3 p-5 sm:p-6">
          <GoogleMark className="h-9 w-9 text-base" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Acceso</h2>
            <p className="truncate text-sm text-ink-500">Entras con Google ({user?.email})</p>
          </div>
        </section>
      ) : (
        <PasswordForm />
      )}
      <TelegramAvisos />
      <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-lg font-bold">Cerrar sesión</h2>
          <p className="text-sm text-ink-500">Sal de tu cuenta en este dispositivo.</p>
        </div>
        <button type="button" onClick={() => setConfirmOpen(true)} className="btn-secondary"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
      </section>
      <ConfirmDialog
        open={confirmOpen}
        title="¿Cerrar sesión?"
        confirmLabel="Cerrar sesión"
        danger={false}
        onConfirm={() => { logout(); navigate('/', { replace: true }); }}
        onClose={() => setConfirmOpen(false)}
      >
        {soloGoogle ? 'Tendrás que volver a entrar con Google.' : 'Tendrás que volver a entrar con tu email y contraseña.'}
      </ConfirmDialog>
    </div>
  );
}
