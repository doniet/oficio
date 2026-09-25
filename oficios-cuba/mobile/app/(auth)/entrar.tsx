import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { ErrorApi, esquemaLogin } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { colores } from '../../src/lib/tema';

export default function Entrar() {
  const { volver } = useLocalSearchParams<{ volver?: string }>();
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const d = esquemaLogin.safeParse({ email, password });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true); setError(undefined);
    try {
      await entrar(d.data);
      router.dismissAll();
      if (volver) router.push(volver as never);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  }

  return (
    <Pantalla titulo="Entrar">
      <Campo etiqueta="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {error ? <Text style={{ color: colores.error }}>{error}</Text> : null}
      <Boton titulo="Entrar" onPress={enviar} cargando={enviando} />
      <Link href={{ pathname: '/(auth)/registro', params: { volver } }} style={{ color: colores.acento, textAlign: 'center' }}>¿No tienes cuenta? Crear cuenta</Link>
    </Pantalla>
  );
}
