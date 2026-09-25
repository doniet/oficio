import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { ErrorApi, esquemaRegistro, UserType } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { colores, espacio } from '../../src/lib/tema';

// Igual que frontend/src/pages/auth/Register.tsx (validate() + aviso del campo teléfono).
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
    <Pantalla titulo="Crear cuenta">
      <View style={{ flexDirection: 'row', gap: espacio(2) }}>
        <View style={{ flex: 1 }}>
          <Boton titulo="Busco un profesional" onPress={() => setTipo('client')} variante={tipo === 'client' ? 'primario' : 'secundario'} />
        </View>
        <View style={{ flex: 1 }}>
          <Boton titulo="Ofrezco mis servicios" onPress={() => setTipo('provider')} variante={tipo === 'provider' ? 'primario' : 'secundario'} />
        </View>
      </View>
      <Campo etiqueta="Nombre completo" value={nombre} onChangeText={setNombre} autoCapitalize="words" autoComplete="name" />
      <Campo etiqueta="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Campo
        etiqueta={tipo === 'provider' ? 'Teléfono / WhatsApp' : 'Teléfono (opcional)'}
        value={telefono}
        onChangeText={setTelefono}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+53 5 123 4567"
        error={errorTelefono}
      />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" />
      {error ? <Text style={{ color: colores.error }}>{error}</Text> : null}
      <Boton titulo={tipo === 'provider' ? 'Crear cuenta profesional' : 'Crear cuenta'} onPress={enviar} cargando={enviando} />
      <Link href={{ pathname: '/(auth)/entrar', params: { volver } }} style={{ color: colores.acento, textAlign: 'center' }}>¿Ya tienes cuenta? Entrar</Link>
    </Pantalla>
  );
}
