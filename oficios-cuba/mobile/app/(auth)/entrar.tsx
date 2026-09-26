import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { ErrorApi, esquemaLogin } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { Aviso, u } from '../../src/componentes/ui';
import { useSesion } from '../../src/lib/contexto';

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
    <Pantalla titulo="Entra a tu cuenta">
      <Text style={[u.subtitulo, { marginTop: -12 }]}>
        ¿No tienes cuenta? <Link href={{ pathname: '/(auth)/registro', params: { volver } }} style={u.enlace}>Regístrate gratis</Link>
      </Text>
      {volver ? <Aviso tono="info">Entra para continuar. Te llevaremos de vuelta a donde estabas.</Aviso> : null}
      {error ? <Aviso tono="error">{error}</Aviso> : null}
      <Campo etiqueta="Correo electrónico" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="tu@correo.com" />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      <Boton titulo="Entrar" icono="log-in-outline" onPress={enviar} cargando={enviando} />
    </Pantalla>
  );
}
