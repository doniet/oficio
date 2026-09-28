# Encuentrauno — rebranding, Explorar con Negocios, cuenta por teléfono, mapa y aprobación

- **Fecha:** 2026-09-28
- **Estado:** diseño aprobado, pendiente de plan de implementación
- **Decisiones tomadas con:** Dariel, sesión del 2026-09-28
- **Fase del proyecto:** desarrollo. No hay producción que preservar: la base de
  vps2 es de demostración y se reinicia. Dariel avisará cuando se entre en
  producción; a partir de ahí vuelven a aplicar las migraciones incrementales,
  las copias de seguridad y la compatibilidad hacia atrás.

## 1. Objetivo

Oficios Cuba pasa a llamarse **Encuentrauno** y deja de ser solo un directorio de
oficios: personas, servicios, productos y negocios en un solo lugar, buscables
también por ubicación en un mapa. Al mismo tiempo se cierra la puerta de entrada:
el teléfono pasa a ser el dato obligatorio de toda cuenta, y ninguna cuenta
profesional es visible hasta que la administración la aprueba.

### Qué cuenta como éxito

1. La marca nueva es coherente en web y en la app: nadie ve «Oficios Cuba».
2. Desde Explorar se llega a servicios, productos y negocios con el mismo gesto.
3. Un visitante encuentra en un mapa lo que tiene cerca sin escribir nada.
4. Nadie publica un servicio o un negocio sin pasar por la administración.
5. A quien se banea no le sirve volver a registrarse con otro correo.

### Qué NO entra

- Cambio de dominio (`oficio.dardoit.com` se queda; moverlo toca Traefik, el
  túnel y el DNS de la cuenta de Doniet, y se coordina aparte).
- Cambiar el `package` de Android (`com.dardoit.oficios`) o el `slug` de Expo:
  romperían la actualización del APK ya instalado.
- Verificación automática del teléfono (API de WhatsApp Business). La
  confirmación la hace el admin a mano al aprobar.
- Liberar «negocio» a los planes Gratis y Básico: sigue siendo del Profesional.

## 2. Decisiones y su porqué

| Decisión | Elegido | Por qué |
|---|---|---|
| Identificador de la cuenta | Correo **o** teléfono, indistinto | El correo deja de ser obligatorio pero las cuentas actuales entran igual que siempre |
| «Negocio» y el plan | Sigue siendo del plan Profesional | Es la ventaja que vende el plan de $10; se acepta que la pestaña nazca vacía |
| Confirmar el teléfono | Aviso en el registro + confirmación manual del admin | La API no tiene salida a internet; WhatsApp Business exige cuenta Meta y gasto por mensaje |
| Alcance del rebranding | Web + app Expo (icono, splash, nombre, paleta) | La app comparte API: el cambio de auth la rompe si se queda atrás |
| Aprobación | La cuenta profesional, una sola vez | Menos carga de moderación que revisar cada publicación |
| Mientras espera | Entra y prepara todo, invisible al público | No se pierde el trabajo ni la gente por el camino |
| Baneo | Hash con sal de cuenta Google + correo + teléfono | El teléfono es la huella más difícil de cambiar en Cuba |
| Ubicación | Obligatoria para profesionales; el visitante se ubica por geolocalización | La ubicación es un dato del proveedor, no del cliente |
| Puntos en el mapa | Publicados por defecto, con opción de ocultarse | Un mapa vacío no sirve de nada |

## 3. Cómo cambia el esquema (estamos en desarrollo)

El esquema se edita **directamente en `schema`** (`backend/src/db/index.ts`) y la
base se reinicia. No se escriben migraciones incrementales: no hay datos que
preservar y `seedBase()` + `seedDemo()` vuelven a sembrar todo al arrancar.

Esto suspende, solo mientras dure la fase de desarrollo, la regla de
`CLAUDE.md` de «cambio de esquema = tocar dos sitios». El array `MIGRACIONES`
se queda como está: una base nueva nace con `user_version = ESQUEMA_VERSION` y
el esquema ya actualizado.

**Consecuencia al desplegar:** hay que borrar `data/oficios.db` (y sus `-wal` y
`-shm`) antes de levantar los contenedores, o la API consultará columnas que no
existen en la base vieja. Las subidas de `data/uploads/` se conservan.

### Riesgos que siguen en pie

1. **La pestaña Negocios nace casi vacía**: «negocio» sigue siendo del plan
   Profesional. Decisión consciente de Dariel.
2. **La aprobación manual es un cuello de botella.** Si nadie mira el panel,
   nadie entra a la plataforma. Se mitiga con un aviso al admin por Telegram
   cuando llega un pendiente, pero sigue dependiendo de una persona.

## 4. Estado de partida (verificado el 2026-09-28)

- Esquema en la versión **10**. En vps2: 19 usuarios (6 clientes, 13
  profesionales), 22 servicios, 0 artículos de catálogo. **Todo de
  demostración y desechable.**
- Ya existe `provider_profiles.kind` (`oficio`/`negocio`), `lat`, `lng` y
  `show_on_map`. Ya existen `MapPointPicker`, `PlaceMap` y `ProvinceMapSelector`.
- Explorar (`/buscar`) ya tiene el mecanismo de pestañas (Oficios/Productos).

## 5. Entregas

Tres entregas en este orden, cada una verificable por separado y con su entrada
en `STATUS.md`. El orden importa porque la 3 apoya en la ubicación obligatoria
que introduce la 2.

| # | Entrega | Contenido |
|---|---|---|
| 1 | Marca + Explorar | Paleta, logo, textos, app Expo, `/explorar` con tres pestañas |
| 2 | Cuenta | Teléfono obligatorio, correo opcional, login por cualquiera, aprobación, baneo |
| 3 | Mapa | Ubicación en el registro, `/mapa`, endpoint de puntos |

---

## Entrega 1 · Marca Encuentrauno y Explorar

### 1.1 Paleta

La escala `brand` de `frontend/tailwind.config.js` se reconstruye sobre el
naranja del logo. `ink`, `sea`, `paper` y `sand` se quedan como están: ya
combinan y cambiarlos multiplicaría el diff sin ganancia.

```
brand: 50 #FFF4EA · 100 #FFE6CC · 200 #FFCB99 · 300 #FFAD5C · 400 #FF922E
       500 #FF7A00 · 600 #C25A00 · 700 #B85400 · 800 #8F4200 · 900 #6B3200
```

**Regla de uso, no negociable por accesibilidad:** `brand-500` (`#FF7A00`) es el
naranja de la marca — logo, iconos, fondos, ilustraciones. Con texto blanco
encima da 2,6:1 y **no cumple WCAG AA**. Los botones rellenos y los enlaces usan
`brand-700` (`#B85400`, 4,9:1 sobre blanco). Donde se quiera el naranja vivo de
fondo, el texto va en `ink-950` (6,8:1).

### 1.2 Logo

`Logo` en `frontend/src/components/ui.tsx:11` pasa a ser una lupa con el «1»
dentro, en SVG inline (sin peticiones extra, coherente con la regla de
conexiones lentas del proyecto), más el wordmark **Encuentra**`uno` — «Encuentra»
en `ink-900`, «uno» en `brand-500`. Mantiene la prop `light` para el pie oscuro.

`frontend/public/favicon.svg` se redibuja con la misma lupa.

### 1.3 Textos y metadatos

- `frontend/index.html`: `<title>`, `description`, `og:title`, `og:description`,
  `theme-color`.
- `Layout.tsx`: `aria-label` del enlace al inicio, párrafo del pie, línea de
  copyright.
- Barrido de «Oficios Cuba» y «directorio de oficios» en `frontend/src` y
  `mobile/`. El toast de bienvenida en `Register.tsx` incluido.
- **No** se renombra la carpeta `oficios-cuba/`, ni el paquete `@oficio/shared`,
  ni los contenedores: son nombres internos y renombrarlos toca despliegue.

### 1.4 App móvil

En `mobile/app.config.ts`: `name` a `Encuentrauno`,
`adaptiveIcon.backgroundColor` y el `color` de `expo-notifications` al naranja
nuevo. `slug`, `scheme`, `package` y `bundleIdentifier` **no se tocan**.

Se regeneran desde el SVG: `assets/images/icon.png`,
`android-icon-foreground.png`, `android-icon-background.png`,
`android-icon-monochrome.png` y `notification-icon.png` (esta última es blanca
sobre transparente: Android solo usa su canal alfa). La paleta de
`mobile/src/lib/tema.ts` se alinea con la escala nueva.

El APK se vuelve a publicar con `mobile/scripts/publicar-apk.sh`.

### 1.5 Explorar

- La ruta `/buscar` pasa a `/explorar`. `/buscar` queda como redirección
  permanente que **conserva la query**, para no romper enlaces compartidos.
- Menú de cabecera: **Explorar · Mapa · Planes**. «Profesionales» sale del menú;
  `/profesionales` sigue existiendo y se llega desde Explorar.
- El título de la página pasa de «Explorar servicios» a «Explorar».
- Tres pestañas (parámetro `tab` en la URL):

| Pestaña | `tab` | Fuente | Filtros |
|---|---|---|---|
| Servicios | *(sin valor)* | `GET /services` | categoría, ubicación, precio, tipo de precio, orden |
| Productos | `productos` | `GET /catalog/search` | ubicación |
| Negocios | `negocios` | `GET /providers?kind=negocio` | categoría, ubicación, orden |

- La pestaña Negocios reusa las tarjetas de proveedor que ya existen. En
  `backend/src/routes/providers.ts` el listado gana el parámetro opcional
  `kind`, validado contra `['oficio','negocio']`.
- Recordatorio del código existente: `segunPlan()` ya devuelve `kind: 'oficio'`
  cuando el plan no incluye negocio, así que filtrar por `kind='negocio'` en SQL
  debe además exigir el plan, o un perfil que bajó de plan seguiría saliendo en
  la pestaña mostrándose como oficio.
- La barra inferior de móvil: «Buscar» pasa a «Explorar» y apunta a `/explorar`.

---

## Entrega 2 · Cuenta, aprobación y baneo

### 2.1 Esquema — `users`

Se edita `schema` directamente. Cambios en `users`:

| Columna | Antes | Después |
|---|---|---|
| `email` | `TEXT UNIQUE NOT NULL` | `TEXT UNIQUE` (nullable) |
| `phone_key` | — | `TEXT UNIQUE` — teléfono normalizado |
| `banned_at` | — | `TEXT` |

`phone_key` lo escribe la aplicación al crear o editar la cuenta. SQLite admite
varios NULL en una columna `UNIQUE`, así que una cuenta sin teléfono (que ya no
se puede crear, pero podría existir en datos sembrados) no choca con otra.

**Normalización (`lib/telefono.ts`, nuevo):** se quitan espacios, guiones y
paréntesis; si empieza por `+` se conserva; si son 8 dígitos se antepone `+53`;
si empieza por `53` y suma 10 dígitos se antepone `+`. La función es la única
puerta: registro, login, edición de perfil, siembra y baneo la usan. Con tests
propios de cada formato.

Tabla nueva `bans`:

```
id TEXT PRIMARY KEY
google_hash TEXT      -- sha256 con sal del google_sub
email_hash TEXT       -- sha256 con sal del correo en minúsculas
phone_hash TEXT       -- sha256 con sal del phone_key
reason TEXT
created_by TEXT       -- users.id del admin
created_at TEXT
```

Índices por cada columna de hash. **Nunca se guarda el dato en claro**, igual
que ya se hace en `apk_descargas`; la sal es `JWT_SECRET`.

### 2.2 Esquema — `provider_profiles`

| Columna | Tipo | Por defecto |
|---|---|---|
| `review_state` | `TEXT CHECK IN ('pending','approved','rejected')` | `'pending'` |
| `reviewed_at` | `TEXT` | NULL |
| `review_note` | `TEXT` | NULL |
| `phone_confirmed_at` | `TEXT` | NULL |

`seed-demo.ts` siembra los perfiles de demostración como `approved` — si no, el
demo aparecería vacío. Conviene sembrar **uno o dos en `pending`** para poder
probar la pantalla de aprobaciones sin tener que registrarse a mano.

### 2.3 El filtro de visibilidad

Hoy 9 rutas filtran por `pp.is_active = 1`. Si alguna no añade el estado de
revisión, un perfil sin aprobar se cuela. Para que no dependa de acordarse:

```ts
// backend/src/db/index.ts
export const PERFIL_VISIBLE = "pp.is_active = 1 AND pp.review_state = 'approved'";
```

Se sustituye en **todos** los sitios: `providers.ts` (listado, destacados,
detalle, contacto), `services.ts` (listado, detalle, relacionados),
`catalog.ts` (`CON_CATALOGO`), `stats.ts` (los cuatro conteos),
`favorites.ts`, `conversations.ts`, `reviews.ts` y `appointments.ts`.

**Cuidado:** cinco de esas consultas no usan el alias `pp`
(`conversations.ts:87`, `favorites.ts:53`, `appointments.ts:24`,
`providers.ts:246`, `services.ts:137` consultan `FROM provider_profiles WHERE
id = ?`). Hay que reescribirlas con el alias para que la constante encaje en
todas; así hay un solo fragmento y no dos que se desincronicen.

Aparte, `services.ts:150` **selecciona** `pp.is_active AS provider_active` en vez
de filtrar: es el detalle que el dueño ve aunque esté pausado. Ahí el estado de
revisión se añade como columna, no como filtro, y la página lo usa para el aviso
de «en revisión».

**Guardia:** un test recorre `backend/src/routes/` y falla si encuentra
`is_active = 1` aplicado a `provider_profiles` fuera de la constante. Es la
única forma de que un endpoint futuro no se olvide.

### 2.4 Registro y login

**Registro** (`POST /auth/register`):
- `phone` pasa a obligatorio para ambos tipos de cuenta; se guarda `phone` en
  claro (para mostrarlo) y `phone_key` normalizado.
- `email` pasa a opcional.
- Al menos uno de los dos debe existir — el teléfono siempre está, así que la
  regla se cumple sola, pero se valida explícitamente por si cambia.
- Se consulta `bans` por correo y teléfono antes de crear nada. Respuesta a un
  baneado: mensaje genérico, sin revelar cuál de las huellas coincidió.
- Un perfil profesional nace con `review_state = 'pending'`.

**Login** (`POST /auth/login`): el campo pasa a llamarse `identifier`. Si
contiene `@` se busca por `email`; si no, se normaliza y se busca por
`phone_key`. Se mantiene la comparación contra `DUMMY_HASH` cuando no hay
usuario, para no delatar por tiempo de respuesta qué cuentas existen. El límite
de 10 fallos por cuenta cada 15 minutos pasa a llevarse por el identificador ya
resuelto. Una cuenta con `banned_at` recibe 403.

Corte limpio: `email` deja de aceptarse como campo de login. La app se actualiza
en la misma entrega, así que no hay clientes viejos que mantener.

**Google** (`POST /auth/google`): cuando la cuenta es nueva, la respuesta
`needs_user_type` pasa a `needs_profile` y pide además el teléfono. El frontend
(`GoogleCallback.tsx`) y la app muestran un paso «confirma tu teléfono» antes de
crear la cuenta. Se consulta `bans` por `google_sub`, correo y teléfono.

**Aviso de WhatsApp:** el formulario de registro dice, junto al campo, que se
contactará por WhatsApp para confirmar el número. Es texto informativo; no hay
envío automático.

### 2.5 Mientras espera aprobación

El profesional entra a su panel y lo hace todo con normalidad: perfil, fotos,
oficios, catálogo. Simplemente no aparece en ningún listado público. El panel
muestra un aviso permanente y honesto: qué falta, que se le escribirá por
WhatsApp al número que dio, y cuál es ese número por si se equivocó.

`GET /auth/me` devuelve `review_state` para que web y app pinten el aviso.

### 2.6 Panel de administración

Pestaña **Aprobaciones**, detrás del 2FA que ya existe, en `routes/admin.ts`:

- `GET /admin/pendientes` — perfiles en `pending`: nombre, teléfono, correo si
  lo dio, ubicación, tipo (oficio/negocio), qué ha preparado y desde cuándo espera.
- `POST /admin/perfiles/:id/aprobar` — `review_state = 'approved'`, opcionalmente
  marcando `phone_confirmed_at`.
- `POST /admin/perfiles/:id/rechazar` — con `review_note` obligatoria.
- `POST /admin/usuarios/:id/banear` — `banned_at`, desactiva el perfil e inserta
  las huellas en `bans`. Pide código 2FA nuevo, como el resto de acciones sensibles.
- `DELETE /admin/bans/:id` — deshacer un baneo.

Todo pasa por `auditar()`. Acciones nuevas en el diccionario de
`RegistroTab.tsx`: `perfil_aprobado`, `perfil_rechazado`, `usuario_baneado`,
`ban_quitado`.

### 2.7 Avisos

Reusando `lib/avisos.ts` y `push/avisos.ts`, que ya solo apuntan en tabla (la
API no tiene salida; envía `oficio_notifier`):

- Al admin, cuando entra un perfil pendiente.
- Al profesional, cuando lo aprueban o lo rechazan (con el motivo).

Grupo nuevo en `users.notify_prefs`: `revision`.

---

## Entrega 3 · Mapa

### 3.1 Ubicación en el registro

Paso nuevo en el registro de profesional: mapa a pantalla completa reusando
`MapPointPicker`, con el botón de «usar mi ubicación» que ya trae. **Obligatorio**
para profesionales: sin punto no existen en el mapa. A los clientes no se les
pide — el visitante se ubica en el momento con la geolocalización del navegador
o del dispositivo, y esa posición no se guarda nunca.

`show_on_map` pasa a `DEFAULT 1` en `schema`. El profesional puede ocultarse
desde su panel, donde el control ya existe.

### 3.2 Endpoint

```
GET /api/mapa?bbox=<sur,oeste,norte,este>&tipo=servicios|negocios|productos
             &q=&category=&zoom=
```

- `bbox` acotado a Cuba, con los mismos límites que valida hoy
  `providers.ts` (`lat` 19–24, `lng` −85,5–−73,5).
- Solo perfiles con `PERFIL_VISIBLE`, `show_on_map = 1` y coordenadas.
- `tipo=productos` sitúa cada artículo en la ubicación de su dueño: un punto por
  perfil, con los artículos que casan dentro. Es lo que pidió Dariel
  literalmente — «la ubicación de los productos será la de su dueño».
- **Agrupación por rejilla en el servidor** cuando el zoom es bajo: se redondean
  las coordenadas a una celda que depende del zoom y se devuelve un punto con su
  cuenta. Evita añadir `leaflet.markercluster` (~30 KB) y bajar miles de
  marcadores por una conexión lenta.
- Tope duro de puntos por respuesta, con una señal de «hay más, acerca el mapa».

Índice `idx_pp_geo ON provider_profiles(lat, lng)` en `schema`.

### 3.3 Página

Ruta `/mapa`, en el menú principal y en la barra inferior de móvil. Mapa a
pantalla completa con:

- Selector de tipo: Servicios · Productos · Negocios.
- Buscador de texto y filtro de categoría, que se aplican sobre lo visible.
- Recarga al mover o hacer zoom, con antirrebote.
- Al tocar un punto, una ficha con la tarjeta del perfil o del artículo y enlace
  a su página.
- Botón «cerca de mí» que pide geolocalización. Si se deniega o no hay señal, el
  mapa se queda en Cuba entera: nunca es un callejón sin salida.

Leaflet ya se carga de forma diferida en el proyecto; se mantiene ese patrón.

## 6. Verificación

Convención del proyecto: `npm test` y `npm run typecheck` en backend,
`npx tsc --noEmit && npm run build` en frontend.

**Backend (vitest + supertest), casos nuevos:**
- Normalización de teléfonos, incluidos los formatos que hay hoy en producción.
- Registro sin teléfono → 400. Registro sin correo → 201.
- Teléfono repetido → 400, escrito en otro formato también.
- Login por correo y por teléfono; con alias `email`; cuenta baneada → 403.
- Un perfil `pending` no sale en ninguno de los 9 listados. Uno por listado.
- El test de guardia que prohíbe `pp.is_active = 1` suelto.
- Aprobar lo hace visible; rechazar lo mantiene oculto y guarda el motivo.
- Banear impide registrarse de nuevo por correo, por teléfono y por Google.
- Mapa: bbox fuera de Cuba → 400; un perfil con `show_on_map = 0` no sale; un
  producto se sitúa en la ubicación de su dueño; la agrupación cuenta bien.
- Una base nueva nace con el esquema completo y `seedBase()` + `seedDemo()`
  la llenan sin fallar.

**Al desplegar:** parar los contenedores, borrar `data/oficios.db*`, levantar y
comprobar que la siembra dejó la base coherente. Nada de copias de seguridad ni
ensayos: los datos son desechables mientras dure la fase de desarrollo.

**Comprobación en navegador:** en vps2 chromium no arranca (falta
`libatk-1.0.so.0`, instalarlo pide sudo). La verificación visual se hace desde
j-u o pidiendo las librerías a Dariel.

## 7. Documentación al cerrar

- `CLAUDE.md`: stack, modelo de datos, rutas de API, páginas, reglas de negocio
  (aprobación, baneo, identificador de la cuenta, mapa) y el apartado de
  esquema y migraciones.
- `STATUS.md`: una entrada por entrega, con el formato de las existentes.
- Coordinar con Doniet antes de pushear a `github.com/doniet/oficio`: es un
  cambio grande sobre `master` compartido.
