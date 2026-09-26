import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useScrollToTop } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { CategoryStat, ErrorApi, textoNumServicios } from '@oficio/shared';
import { Cabecera } from '../../src/componentes/Cabecera';
import { Boton } from '../../src/componentes/Boton';
import { TarjetaServicio, TarjetaServicioEsqueleto } from '../../src/componentes/TarjetaServicio';
import { TarjetaProfesional, TarjetaProfesionalEsqueleto } from '../../src/componentes/TarjetaProfesional';
import { Chip, Esqueleto, EstadoError, TituloSeccion, u } from '../../src/componentes/ui';
import { useSesion } from '../../src/lib/contexto';
import { brand, fuentes, ink, paper, sand, sombra } from '../../src/lib/tema';

// Los mismos que la portada web (POPULAR en Home.tsx).
const POPULARES = ['Electricista', 'Plomero', 'Mecánico', 'Clases', 'Peluquería', 'Aire acondicionado'];

const buscar = (params: { q?: string; categoria?: string; nombre?: string }) =>
  router.navigate({ pathname: '/buscar', params: { ...params, t: String(Date.now()) } });

function Buscador() {
  const [q, setQ] = useState('');
  const enviar = () => buscar({ q: q.trim() });
  return (
    <View style={e.buscador}>
      <View style={e.buscadorCampo}>
        <Ionicons name="search-outline" size={20} color={ink[300]} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="¿Qué necesitas? Ej: electricista"
          placeholderTextColor={ink[300]}
          returnKeyType="search"
          onSubmitEditing={(ev) => buscar({ q: ev.nativeEvent.text.trim() })}
          accessibilityLabel="¿Qué necesitas?"
          style={e.buscadorInput}
        />
      </View>
      <Boton titulo="Buscar" onPress={enviar} />
    </View>
  );
}

function Categorias({ categorias, cargando }: { categorias: CategoryStat[]; cargando: boolean }) {
  const filas: CategoryStat[][] = [];
  for (let i = 0; i < categorias.length; i += 2) filas.push(categorias.slice(i, i + 2));
  if (cargando) {
    return <View style={e.rejilla}>{[0, 1, 2].map((i) => <View key={i} style={e.filaRejilla}><Esqueleto estilo={e.celdaEsqueleto} /><Esqueleto estilo={e.celdaEsqueleto} /></View>)}</View>;
  }
  return (
    <View style={e.rejilla}>
      {filas.map((fila, i) => (
        <View key={i} style={e.filaRejilla}>
          {fila.map((c) => (
            <Pressable key={c.id} accessibilityRole="link" onPress={() => buscar({ categoria: c.slug, nombre: c.name })}
              style={({ pressed }) => [u.tarjeta, e.celda, pressed && { borderColor: sand[300] }]}>
              <View style={e.celdaIcono}><Text style={{ fontSize: 22 }}>{c.icon}</Text></View>
              <View>
                <Text style={e.celdaNombre}>{c.name}</Text>
                <Text style={[u.tenue, { fontSize: 12, marginTop: 2 }]}>{textoNumServicios(c.service_count)}</Text>
              </View>
            </Pressable>
          ))}
          {fila.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function VerMas({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={[u.fila, { alignSelf: 'flex-start' }]}>
      <Text style={u.enlace}>{texto}</Text>
      <Ionicons name="arrow-forward" size={16} color={brand[700]} />
    </Pressable>
  );
}

export default function Inicio() {
  const { api } = useSesion();
  // Tocar "Inicio" estando ya en Inicio vuelve arriba, como en cualquier app nativa.
  const lista = useRef<ScrollView>(null);
  useScrollToTop(lista);
  const categorias = useQuery({ queryKey: ['categorias', 'estadisticas'], queryFn: () => api.categorias.estadisticas(), staleTime: 300_000 });
  const destacados = useQuery({ queryKey: ['proveedores', 'destacados'], queryFn: () => api.proveedores.destacados(6) });
  const nuevos = useQuery({ queryKey: ['servicios', 'nuevos'], queryFn: () => api.servicios.listar({ sort: 'newest', limit: 8 }) });

  const recargando = categorias.isRefetching || destacados.isRefetching || nuevos.isRefetching;
  const recargar = () => { void categorias.refetch(); void destacados.refetch(); void nuevos.refetch(); };
  // Si fallan las tres a la vez casi seguro es la red: un solo aviso arriba en vez de tres.
  const todoFallo = categorias.isError && destacados.isError && nuevos.isError;
  const mensajeError = (err: unknown) => (err instanceof ErrorApi ? err.message : 'Algo salió mal. Inténtalo de nuevo.');

  const listaDestacados = destacados.data?.providers ?? [];
  const listaNuevos = nuevos.data?.services ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }} edges={['top']}>
      <Cabecera />
      <ScrollView
        ref={lista}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={recargar} colors={[brand[600]]} />}
      >
        <View style={e.hero}>
          <Text style={u.eyebrow}>DIRECTORIO DE OFICIOS · TODA CUBA</Text>
          <Text style={e.titulo}>El que te lo soluciona <Text style={{ color: brand[600] }}>vive cerca.</Text></Text>
          <Text style={e.subtitulo}>
            Electricistas, mecánicos, costureras, profesores y cientos de oficios más. Mira sus trabajos, lee reseñas reales y escríbeles directo.
          </Text>
          <Buscador />
          <View style={e.populares}>
            <Text style={[u.tenue, { fontSize: 14 }]}>Lo más buscado:</Text>
            {POPULARES.map((t) => (
              <Pressable key={t} onPress={() => buscar({ q: t })} accessibilityRole="link">
                <Chip texto={t} pequeno />
              </Pressable>
            ))}
          </View>
        </View>

        {todoFallo ? (
          <View style={e.seccion}><EstadoError mensaje={mensajeError(categorias.error)} alReintentar={recargar} /></View>
        ) : null}

        {!todoFallo ? (
          <View style={e.seccion}>
            <TituloSeccion eyebrow="Categorías" titulo="¿Qué necesitas resolver?" />
            <VerMas texto="Ver todos los servicios" onPress={() => buscar({})} />
            {categorias.isError ? <EstadoError mensaje={mensajeError(categorias.error)} alReintentar={() => categorias.refetch()} />
              : <Categorias categorias={categorias.data?.categories ?? []} cargando={categorias.isLoading} />}
          </View>
        ) : null}

        {!todoFallo && (destacados.isLoading || listaDestacados.length > 0) ? (
          <View style={[e.seccion, e.seccionArena]}>
            <TituloSeccion eyebrow="Destacados" titulo="Profesionales con buena mano" subtitulo="Los mejor valorados por sus clientes." />
            <View style={{ gap: 20 }}>
              {destacados.isLoading ? [0, 1].map((i) => <TarjetaProfesionalEsqueleto key={i} />)
                : listaDestacados.map((p) => <TarjetaProfesional key={p.id} p={p} />)}
            </View>
          </View>
        ) : null}

        {!todoFallo && (nuevos.isLoading || listaNuevos.length > 0) ? (
          <View style={e.seccion}>
            <TituloSeccion eyebrow="Recién publicados" titulo="Servicios nuevos" />
            <VerMas texto="Ver más" onPress={() => buscar({})} />
            <View style={{ gap: 20 }}>
              {nuevos.isLoading ? [0, 1].map((i) => <TarjetaServicioEsqueleto key={i} />)
                : listaNuevos.map((s) => <TarjetaServicio key={s.id} s={s} />)}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, gap: 16, borderBottomWidth: 1, borderBottomColor: sand[200] },
  titulo: { fontFamily: fuentes.tituloExtra, fontSize: 38, lineHeight: 40, color: ink[900], letterSpacing: -1 },
  subtitulo: { fontFamily: fuentes.texto, fontSize: 17, lineHeight: 26, color: ink[500] },
  buscador: { marginTop: 8, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: sand[300], backgroundColor: '#ffffff', padding: 8, ...sombra.lift },
  buscadorCampo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  buscadorInput: { flex: 1, minHeight: 48, fontFamily: fuentes.texto, fontSize: 15, color: ink[900] },
  populares: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  seccion: { paddingHorizontal: 16, paddingVertical: 40, gap: 20 },
  seccionArena: { backgroundColor: 'rgba(244,238,228,0.6)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: sand[200] },
  rejilla: { gap: 12 },
  filaRejilla: { flexDirection: 'row', gap: 12 },
  // Icono encima del nombre (la web lo pone al lado): a 2 columnas en un teléfono, "Entretenimiento"
  // o "Mantenimiento" no caben junto al icono y Android los parte a mitad de palabra.
  celda: { flex: 1, gap: 10, padding: 14 },
  celdaIcono: { width: 44, height: 44, borderRadius: 12, backgroundColor: sand[100], alignItems: 'center', justifyContent: 'center' },
  celdaNombre: { fontFamily: fuentes.textoNegrita, fontSize: 15, lineHeight: 20, color: ink[900] },
  celdaEsqueleto: { flex: 1, height: 116, borderRadius: 16 },
});
