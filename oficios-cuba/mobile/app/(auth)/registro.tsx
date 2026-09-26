import { ComponentProps, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { ErrorApi, esquemaRegistro, UserType } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { Aviso, u } from '../../src/componentes/ui';
import { brand, fuentes, ink, sand, sombra } from '../../src/lib/tema';

// Igual que frontend/src/pages/auth/Register.tsx (validate() + aviso del campo teléfono).
// Mismas tarjetas que el registro web (Register.tsx).
const TIPOS: { valor: UserType; titulo: string; texto: string; icono: ComponentProps<typeof Ionicons>['name'] }[] = [
  { valor: 'client', titulo: 'Busco un profesional', texto: 'Encuentra, escribe y valora.', icono: 'search-outline' },
  { valor: 'provider', titulo: 'Ofrezco mi oficio o negocio', texto: 'Empieza gratis y recibe clientes.', icono: 'briefcase-outline' },
];

const AVISO_TELEFONO_PROVEEDOR = 'Los clientes te contactarán por este número.';

export default function Registro() {
  const { volver } = useLocalSearchParams<{ volver?: string }>();
  const { registrarse } = useSesion();
  const [tipo, setTipo] = useState<UserType>('client');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [errorTelefono, setErrorTelefono] = useState<string>();
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErrorTelefono(undefined);
    setError(undefined);
    // Regla de negocio (no la exige el esquema zod, que deja phone opcional): un proveedor sin
    // teléfono no puede recibir clientes por WhatsApp. Se avisa como error del propio campo.
    if (tipo === 'provider' && !telefono.trim()) {
      setErrorTelefono(AVISO_TELEFONO_PROVEEDOR);
      return;
    }
    const d = esquemaRegistro.safeParse({
      email, password, full_name: nombre, phone: telefono.trim() || undefined, user_type: tipo,
    });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true);
    try {
      await registrarse(d.data);
      router.dismissAll();
      if (volver) router.push(volver as never);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  }

  return (
    <Pantalla titulo="Crea tu cuenta gratis">
      <Text style={[u.subtitulo, { marginTop: -12 }]}>
        ¿Ya tienes cuenta? <Link href={{ pathname: '/(auth)/entrar', params: { volver } }} style={u.enlace}>Entra aquí</Link>
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }} accessibilityRole="radiogroup">
        {TIPOS.map((t) => {
          const activo = tipo === t.valor;
          return (
            <Pressable key={t.valor} onPress={() => setTipo(t.valor)} accessibilityRole="radio" accessibilityState={{ checked: activo }}
              style={[s.tipo, activo ? [s.tipoActivo, sombra.card] : null]}>
              <View style={[s.tipoIcono, { backgroundColor: activo ? brand[600] : sand[100] }]}>
                <Ionicons name={t.icono} size={20} color={activo ? '#ffffff' : ink[600]} />
              </View>
              <Text style={s.tipoTitulo}>{t.titulo}</Text>
              <Text style={s.tipoTexto}>{t.texto}</Text>
              {activo ? <Ionicons name="checkmark" size={20} color={brand[600]} style={s.check} /> : null}
            </Pressable>
          );
        })}
      </View>
      {tipo === 'provider' ? (
        <Text style={s.nota}>
          <Text style={{ fontFamily: fuentes.textoNegrita, color: ink[900] }}>Empieza gratis:</Text> nombre, logo, descripción, dirección y teléfono. Mejora cuando quieras.
        </Text>
      ) : null}
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Campo etiqueta={tipo === 'provider' ? 'Tu nombre (el negocio lo añades después)' : 'Nombre completo'} value={nombre} onChangeText={setNombre} autoCapitalize="words" autoComplete="name" />
      <Campo etiqueta="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="tu@correo.com" />
      <Campo
        etiqueta={tipo === 'provider' ? 'Teléfono / WhatsApp' : 'Teléfono (opcional)'}
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+53 5 123 4567"
        error={errorTelefono}
      />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" ayuda="Mínimo 8 caracteres." />
      <Boton titulo={tipo === 'provider' ? 'Crear cuenta profesional' : 'Crear cuenta'} onPress={enviar} cargando={enviando} />
    </Pantalla>
  );
}

const s = StyleSheet.create({
  tipo: { flex: 1, gap: 8, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: sand[200], backgroundColor: '#ffffff' },
  tipoActivo: { borderColor: brand[500] },
  tipoIcono: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tipoTitulo: { fontFamily: fuentes.textoNegrita, fontSize: 14, lineHeight: 18, color: ink[900] },
  tipoTexto: { fontFamily: fuentes.texto, fontSize: 12, lineHeight: 16, color: ink[500] },
  check: { position: 'absolute', top: 12, right: 12 },
  nota: { borderRadius: 12, backgroundColor: sand[100], paddingHorizontal: 14, paddingVertical: 10, fontFamily: fuentes.texto, fontSize: 14, lineHeight: 20, color: ink[600] },
});
