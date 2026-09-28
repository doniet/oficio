# Encuentrauno · Entrega 1 — Marca y Explorar · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oficios Cuba pasa a llamarse Encuentrauno en web y en la app, y «Explorar servicios» se convierte en «Explorar» con tres pestañas: Servicios, Productos y Negocios.

**Architecture:** Cambio de presentación casi entero. La escala `brand` de Tailwind y su copia en el tema de la app se reconstruyen sobre el naranja del logo; el componente `Logo` pasa a ser un SVG inline nuevo; los iconos de la app se generan desde ese mismo SVG con un script para que no se desincronicen. Lo único que toca el backend es un parámetro `kind` en `GET /providers`, que es lo que alimenta la pestaña Negocios.

**Tech Stack:** React 18 · Vite 5 · Tailwind 3 · React Router 6 · Express 4 · TypeScript · better-sqlite3 · vitest + supertest · Expo 57 / React Native 0.86 · sharp (nuevo, solo para generar iconos)

**Spec:** `docs/superpowers/specs/2026-09-28-encuentrauno-design.md`

## Global Constraints

- Todo el texto de la UI en **español de Cuba**, con tuteo. Nunca voseo.
- **Sin CDNs ni Google Fonts.** Imágenes `.webp` locales. El proyecto está pensado para conexiones lentas.
- Comentarios solo para el **porqué** no obvio, nunca para el qué.
- Commits en español, descriptivos. Terminan con:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **`brand-500` (`#FF7A00`) nunca lleva texto blanco encima**: da 2,6:1 y WCAG AA pide 4,5:1. Botones rellenos y enlaces usan `brand-700` (`#B85400`, 4,9:1). Sobre naranja vivo, el texto va en `ink-950`.
- **No se tocan** `slug`, `scheme`, `package` (`com.dardoit.oficios`) ni `bundleIdentifier` de Expo: romperían la actualización del APK instalado.
- **No se renombra** la carpeta `oficios-cuba/`, el paquete `@oficio/shared` ni los contenedores.
- Verificación del backend: `npm test` y `npm run typecheck` en `backend/`.
  Verificación del frontend: `npx tsc --noEmit && npm run build` en `frontend/`.
- Estamos en desarrollo: la base de datos es desechable y el esquema se edita directo. Esta entrega no toca el esquema.

### Limitación conocida del entorno

En vps2 **chromium no arranca** (falta `libatk-1.0.so.0`; instalarlo pide sudo), así que **no hay verificación visual en navegador desde aquí**. Las tareas de marca terminan con una comprobación de compilación y un volcado del HTML/CSS generado; la comprobación visual la hace Dariel, o instala las librerías con sudo si prefiere que la haga yo.

## Review Focus

Cinco cosas que la spec da por supuestas y que ninguna tarea probaría por sí sola. Cada una tiene su prueba añadida a la tarea que posee el código.

1. **La redirección `/buscar` → `/explorar` debe conservar la query entera**, `tab` incluido. Un enlace compartido que pierda los filtros lleva a un listado distinto del prometido. → Tarea 6.
2. **Un perfil que era negocio y bajó de plan** no puede salir en la pestaña Negocios: `segunPlan()` ya lo muestra como oficio, y si el SQL no exige el plan aparece una tarjeta que se contradice a sí misma. → Tarea 5.
3. **`?kind=` con un valor inventado** debe dar 400, nunca colarse en el SQL ni devolverse el listado entero como si nada. → Tarea 5.
4. **Los filtros de Servicios activos en la URL al cambiar a Negocios** (`price_max`, `price_type`) deben ignorarse, igual que ya ocurre en Productos, y no contar en el número de filtros activos. → Tarea 7.
5. **El logo en el pie oscuro** (`<Logo light />`): «Encuentra» va en blanco. En `ink-900` sobre `ink-950` sería invisible. → Tarea 2.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `frontend/tailwind.config.js` | Escala `brand` naranja | 1 |
| `mobile/src/lib/tema.ts` | La misma escala para la app | 1 |
| `frontend/src/components/ui.tsx` | Componente `Logo` | 2 |
| `frontend/public/favicon.svg` | Favicon | 2 |
| `mobile/src/componentes/Cabecera.tsx` | Logo de la app | 2 |
| `frontend/index.html` | Título y metadatos | 3 |
| *(13 archivos de `frontend/src`)* | Textos que dicen «Oficios Cuba» | 3 |
| `mobile/assets/marca/glifo.svg` | **Nuevo.** La lupa sola, origen de todos los PNG | 4 |
| `mobile/scripts/generar-iconos.mjs` | **Nuevo.** SVG → los 6 PNG de la app | 4 |
| `mobile/app.config.ts` | Nombre y colores de la app | 4 |
| `backend/src/routes/providers.ts` | Parámetro `kind` en el listado | 5 |
| `backend/test/negocios.test.ts` | **Nuevo.** Pruebas del filtro | 5 |
| `frontend/src/App.tsx` | Ruta `/explorar` y redirección | 6 |
| `frontend/src/components/Layout.tsx` | Menú y barra inferior | 6 |
| `frontend/src/pages/Search.tsx` | Tercera pestaña | 7 |
| `frontend/src/services/api.ts` | Sin cambios de firma (`providerApi.getAll` ya acepta params) | 7 |

---

### Task 1: Paleta naranja en web y app

**Files:**
- Modify: `frontend/tailwind.config.js:8-13`
- Modify: `mobile/src/lib/tema.ts:2-6,25`

**Interfaces:**
- Consumes: nada.
- Produces: las clases `brand-50` … `brand-900` de Tailwind y el objeto `brand` de `tema.ts`, con los valores de la tabla de abajo. Todas las tareas siguientes los usan.

No hay prueba automática para un cambio de paleta: el proyecto no tiene tests de frontend. La verificación es que compila y que no queda ningún terracota suelto.

- [ ] **Step 1: Sustituir la escala `brand` en Tailwind**

En `frontend/tailwind.config.js`, reemplaza el bloque `brand` y su comentario:

```js
        // Naranja Encuentrauno: la marca. Ojo con el contraste — ver el comentario de abajo.
        brand: {
          50: '#FFF4EA', 100: '#FFE6CC', 200: '#FFCB99', 300: '#FFAD5C', 400: '#FF922E',
          500: '#FF7A00', 600: '#C25A00', 700: '#B85400', 800: '#8F4200', 900: '#6B3200',
        },
        // brand-500 es el naranja del logo: vale para fondos, iconos e ilustraciones, pero con
        // texto blanco encima da 2,6:1 y WCAG AA pide 4,5:1. Los botones rellenos y los enlaces
        // usan brand-700 (4,9:1). Sobre naranja vivo, el texto va en ink-950.
```

- [ ] **Step 2: Sustituir la escala `brand` en el tema de la app**

En `mobile/src/lib/tema.ts`, reemplaza el objeto `brand` (líneas 2-6) por:

```ts
export const brand = {
  50: '#FFF4EA', 100: '#FFE6CC', 200: '#FFCB99', 300: '#FFAD5C', 400: '#FF922E',
  500: '#FF7A00', 600: '#C25A00', 700: '#B85400', 800: '#8F4200', 900: '#6B3200',
} as const;
```

- [ ] **Step 3: Subir el acento de la app a `brand[700]`**

`colores.acento` se usa con `acentoTexto: '#ffffff'`. Con el naranja nuevo, `brand[600]` da 4,34:1 y se queda corto. En `mobile/src/lib/tema.ts`, dentro de `colores`, cambia:

```ts
  acento: brand[700], acentoTexto: '#ffffff', mar: sea[600], error: '#b42318',
```

- [ ] **Step 4: Comprobar que no queda terracota suelto**

```bash
cd oficios-cuba
grep -rn "C8472B\|D85A3A\|A63922\|c8472b" frontend/src frontend/tailwind.config.js mobile/src mobile/app.config.ts
```

Esperado: solo aparece `#c8472b` en `mobile/app.config.ts` (líneas de `adaptiveIcon.backgroundColor` y del color de notificaciones). Eso lo arregla la Tarea 4. Si sale algo en `frontend/src` o en `mobile/src`, es un color escrito a mano que hay que pasar a la escala.

- [ ] **Step 5: Compilar el frontend**

```bash
cd oficios-cuba/frontend && npx tsc --noEmit && npm run build
```

Esperado: ambos terminan sin error.

- [ ] **Step 6: Comprobar que el tema de la app tipa**

```bash
cd oficios-cuba/mobile && npx tsc --noEmit
```

Esperado: sin errores nuevos. (Si ya había errores previos en la app, anótalos: no los arregla esta tarea.)

- [ ] **Step 7: Commit**

```bash
cd oficios-cuba
git add frontend/tailwind.config.js mobile/src/lib/tema.ts
git commit -m "Marca: la paleta pasa al naranja de Encuentrauno

brand-500 (#FF7A00) es el naranja del logo y solo vale para fondos e
iconos: con texto blanco da 2,6:1. Los botones y enlaces usan brand-700
(4,9:1), y por eso el acento de la app sube de brand-600 a brand-700.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Logo y favicon

**Files:**
- Modify: `frontend/src/components/ui.tsx:11-25`
- Modify: `frontend/public/favicon.svg` (reemplazar entero)
- Modify: `mobile/src/componentes/Cabecera.tsx:9-17,24`

**Interfaces:**
- Consumes: la escala `brand` de la Tarea 1.
- Produces: `Logo({ light?: boolean, className?: string })` en `ui.tsx` — misma firma que antes, así que sus 4 usos actuales no cambian. `Logo()` en `Cabecera.tsx` sigue sin props.

El glifo es una lupa: un aro, un mango en diagonal y un «1» dentro. Se dibuja con `currentColor` donde haga falta para que la variante del pie funcione.

- [ ] **Step 1: Reescribir el componente `Logo`**

En `frontend/src/components/ui.tsx`, reemplaza las líneas 11-25 por:

```tsx
export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <g fill="none" stroke="#FF7A00" strokeLinecap="round">
          <circle cx="17" cy="17" r="11.5" strokeWidth="5" />
          <path d="M25.6 25.6 34.3 34.3" strokeWidth="6" />
          <path d="M13.4 14.2 17.6 10.6V23.4" strokeWidth="4.6" strokeLinejoin="round" />
        </g>
      </svg>
      <span className={cn('font-display text-[1.2rem] font-bold leading-none tracking-tight', light ? 'text-white' : 'text-ink-900')}>
        Encuentra<span className="text-brand-500">uno</span>
      </span>
    </span>
  );
}
```

Fíjate en que «uno» va en `brand-500` en las dos variantes: el naranja contrasta de sobra sobre `ink-950` (7,0:1) y sobre blanco es texto decorativo de marca, no información. «Encuentra» sí cambia a blanco con `light`.

- [ ] **Step 2: Reemplazar el favicon**

Escribe `frontend/public/favicon.svg` entero:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <g fill="none" stroke="#FF7A00" stroke-linecap="round">
    <circle cx="17" cy="17" r="11.5" stroke-width="5"/>
    <path d="M25.6 25.6 34.3 34.3" stroke-width="6"/>
    <path d="M13.4 14.2 17.6 10.6V23.4" stroke-width="4.6" stroke-linejoin="round"/>
  </g>
</svg>
```

- [ ] **Step 3: Actualizar el logo de la app**

En `mobile/src/componentes/Cabecera.tsx`, cambia el comentario y el texto (el icono se regenera en la Tarea 4, así que `ICONO` no se toca):

```tsx
/** Logo de la web: la lupa con el 1 + "Encuentra" en tinta y "uno" en brand. */
export function Logo() {
  return (
    <View style={s.logo} accessibilityRole="header" accessibilityLabel="Encuentrauno">
      <Image source={ICONO} style={s.icono} contentFit="cover" />
      <Text style={s.nombre}>Encuentra<Text style={{ color: brand[500] }}>uno</Text></Text>
    </View>
  );
}
```

Y en `Cabecera()`, el `accessibilityLabel` del `Pressable`:

```tsx
      <Pressable onPress={() => router.navigate('/')} accessibilityRole="link" accessibilityLabel="Encuentrauno, inicio" hitSlop={6}>
```

- [ ] **Step 4: Comprobar la variante del pie (punto 5 de Review Focus)**

No hay tests de frontend, así que se comprueba en el HTML generado. Arranca el frontend y vuelca el pie:

```bash
cd oficios-cuba/frontend && npm run build
grep -o 'Encuentra<span class="[^"]*">uno' dist/assets/*.js | head
```

Esperado: aparece al menos una vez y la clase incluye `text-brand-500`.

Luego, revisando `ui.tsx` a ojo, confirma que **`light` pone `text-white` en «Encuentra»** y que no queda ningún `text-ink-900` incondicional en ese `<span>`. Si «Encuentra» quedara en `ink-900`, en el pie oscuro sería invisible.

- [ ] **Step 5: Compilar**

```bash
cd oficios-cuba/frontend && npx tsc --noEmit && npm run build
cd ../mobile && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
cd oficios-cuba
git add frontend/src/components/ui.tsx frontend/public/favicon.svg mobile/src/componentes/Cabecera.tsx
git commit -m "Marca: el logo pasa a la lupa con el 1 de Encuentrauno

SVG inline, sin peticiones extra. En el pie oscuro «Encuentra» va en
blanco y «uno» se queda en brand-500, que contrasta 7:1 sobre ink-950.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Textos y metadatos de la marca

**Files:**
- Modify: `frontend/index.html:8-11`
- Modify: `frontend/src/components/Layout.tsx:147,201,219`
- Modify: `frontend/src/components/DescargarApp.tsx:64`
- Modify: `frontend/src/components/GoogleButton.tsx:69,90`
- Modify: `frontend/src/components/ContactActions.tsx:91,113,114`
- Modify: `frontend/src/components/catalog/CatalogItemModal.tsx:49,50`
- Modify: `frontend/src/pages/auth/Register.tsx:66`
- Modify: `frontend/src/pages/auth/AuthShell.tsx:27`
- Modify: `frontend/src/pages/Plans.tsx:24`
- Modify: `frontend/src/pages/ServiceDetail.tsx:222,223,376`
- Modify: `frontend/src/pages/ProviderProfile.tsx:137,138,224`
- Modify: `frontend/src/pages/NotFound.tsx:10`
- Modify: `frontend/src/lib/cuba.ts:98`
- Modify: `mobile/src/lib/contacto.ts:13`

**Interfaces:**
- Consumes: nada.
- Produces: nada que otra tarea use. Es un barrido de cadenas.

- [ ] **Step 1: Metadatos de la página**

En `frontend/index.html`, reemplaza las líneas 8-11:

```html
    <title>Encuentrauno · Personas, servicios, productos y negocios</title>
    <meta name="description" content="Encuentra profesionales y oficios cerca de ti, explora catálogos de productos y descubre negocios con su ubicación y reseñas. Todo en un solo lugar, en toda Cuba." />
    <meta property="og:title" content="Encuentrauno" />
    <meta property="og:description" content="Personas, servicios, productos y negocios, todo en un solo lugar." />
```

- [ ] **Step 2: Cabecera y pie**

En `frontend/src/components/Layout.tsx`:

Línea 147 — el `aria-label` del enlace al inicio:
```tsx
            <Link to="/" aria-label="Encuentrauno, inicio"><Logo /></Link>
```

Línea 201 — el párrafo del pie:
```tsx
                <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
                  Personas, servicios, productos y negocios, todo en un solo lugar. Encuentra lo que necesitas cerca de ti y habla directo con quien lo ofrece.
                </p>
```

Línea 219 — el copyright:
```tsx
              <p>© {new Date().getFullYear()} Encuentrauno · Un proyecto de DARDOIT</p>
```

- [ ] **Step 3: El resto de las cadenas**

Aplica estos reemplazos exactos, archivo por archivo:

| Archivo:línea | Antes | Después |
|---|---|---|
| `DescargarApp.tsx:64` | `Oficios Cuba en tu teléfono` | `Encuentrauno en tu teléfono` |
| `GoogleButton.tsx:69` | `¡Te damos la bienvenida a Oficios Cuba!` | `¡Te damos la bienvenida a Encuentrauno!` |
| `GoogleButton.tsx:90` | `¿Cómo vas a usar Oficios Cuba?` | `¿Cómo vas a usar Encuentrauno?` |
| `ContactActions.tsx:91` | `en Oficios Cuba. ¿Tienes disponibilidad` | `en Encuentrauno. ¿Tienes disponibilidad` |
| `ContactActions.tsx:91` | `tu perfil en Oficios Cuba y me gustaría` | `tu perfil en Encuentrauno y me gustaría` |
| `ContactActions.tsx:113` | `en Oficios Cuba y me interesa.` | `en Encuentrauno y me interesa.` |
| `ContactActions.tsx:114` | `tu perfil en Oficios Cuba y me gustaría` | `tu perfil en Encuentrauno y me gustaría` |
| `CatalogItemModal.tsx:49` | `que vi en Oficios Cuba.` | `que vi en Encuentrauno.` |
| `CatalogItemModal.tsx:50` | `tu catálogo de Oficios Cuba.` | `tu catálogo de Encuentrauno.` |
| `Register.tsx:66` | `¡Te damos la bienvenida a Oficios Cuba!` | `¡Te damos la bienvenida a Encuentrauno!` |
| `AuthShell.tsx:27` | `>Oficios Cuba</p>` | `>Encuentrauno</p>` |
| `Plans.tsx:24` | `El chat dentro de Oficios Cuba` | `El chat dentro de Encuentrauno` |
| `ServiceDetail.tsx:222` | `· Oficios Cuba\`` | `· Encuentrauno\`` |
| `ServiceDetail.tsx:223` | `'Oficios Cuba'` | `'Encuentrauno'` |
| `ServiceDetail.tsx:376` | `Oficios Cuba no cobra comisión.` | `Encuentrauno no cobra comisión.` |
| `ProviderProfile.tsx:137` | `· Oficios Cuba\`` | `· Encuentrauno\`` |
| `ProviderProfile.tsx:138` | `'Oficios Cuba'` | `'Encuentrauno'` |
| `ProviderProfile.tsx:224` | `En Oficios Cuba desde` | `En Encuentrauno desde` |
| `NotFound.tsx:10` | `Página no encontrada · Oficios Cuba` | `Página no encontrada · Encuentrauno` |
| `cuba.ts:98` | `PRODID:-//Oficios Cuba//Agenda//ES` | `PRODID:-//Encuentrauno//Agenda//ES` |
| `contacto.ts:13` | `en Oficios Cuba y me interesa.` | `en Encuentrauno y me interesa.` |

- [ ] **Step 4: Comprobar que no queda ninguna**

```bash
cd oficios-cuba
grep -rn "Oficios Cuba\|OficiosCuba" frontend/src frontend/index.html mobile/src mobile/app
```

Esperado: **ninguna línea**. (`mobile/app.config.ts:38` menciona «Oficios Cuba» en un comentario sobre la llave de firma; eso es correcto que se quede y no lo cubre este grep.)

- [ ] **Step 5: Compilar**

```bash
cd oficios-cuba/frontend && npx tsc --noEmit && npm run build
cd ../mobile && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
cd oficios-cuba
git add frontend/index.html frontend/src mobile/src/lib/contacto.ts
git commit -m "Marca: los textos pasan a Encuentrauno

Título, metadatos, pie, mensajes de WhatsApp prellenados, títulos de
página y el PRODID de los .ics.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Iconos y configuración de la app Expo

**Files:**
- Create: `mobile/assets/marca/glifo.svg`
- Create: `mobile/scripts/generar-iconos.mjs`
- Modify: `mobile/package.json` (devDependency `sharp` + script)
- Modify: `mobile/app.config.ts:16,29,41`
- Regenerate: `mobile/assets/images/{icon,splash-icon,android-icon-foreground,android-icon-background,android-icon-monochrome,notification-icon}.png`

**Interfaces:**
- Consumes: el glifo de la Tarea 2 (mismos trazos) y la paleta de la Tarea 1.
- Produces: los seis PNG con las rutas que `app.config.ts` ya declara — no cambian de nombre, así que nada más se entera.

El script existe para que el glifo viva **en un solo sitio**. Si el logo cambia, se edita el SVG y se vuelve a correr.

- [ ] **Step 1: Instalar sharp como dependencia de desarrollo**

```bash
cd oficios-cuba/mobile && npm install --save-dev sharp@^0.35.5
```

Esperado: instala sin error. Si la red del host fallara, el resto de la tarea queda bloqueado: dilo y sigue con la Tarea 5, que es independiente.

- [ ] **Step 2: Crear el glifo**

Escribe `mobile/assets/marca/glifo.svg`. Los trazos son los mismos que el `Logo` de la web, en un lienzo cuadrado con aire alrededor:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="1024" height="1024">
  <g fill="none" stroke="#FF7A00" stroke-linecap="round">
    <circle cx="17" cy="17" r="11.5" stroke-width="5"/>
    <path d="M25.6 25.6 34.3 34.3" stroke-width="6"/>
    <path d="M13.4 14.2 17.6 10.6V23.4" stroke-width="4.6" stroke-linejoin="round"/>
  </g>
</svg>
```

- [ ] **Step 3: Escribir el generador**

Escribe `mobile/scripts/generar-iconos.mjs`:

```js
// Genera los PNG de la app desde assets/marca/glifo.svg: así el logo vive en un solo sitio.
// Correr con `npm run iconos` después de tocar el glifo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(raiz, 'assets/images');
const PAPER = '#FAF6EF';

const glifo = readFileSync(resolve(raiz, 'assets/marca/glifo.svg'), 'utf8');
/** El mismo glifo pintado de otro color, para las capas monocromas. */
const teñido = (color) => Buffer.from(glifo.replaceAll('#FF7A00', color));

/** Dibuja el glifo centrado ocupando `proporción` del lienzo, sobre `fondo` (null = transparente). */
async function pieza(archivo, lado, proporcion, fondo, color = '#FF7A00') {
  const dentro = Math.round(lado * proporcion);
  const glifoPng = await sharp(teñido(color)).resize(dentro, dentro).png().toBuffer();
  const lienzo = sharp({
    create: {
      width: lado, height: lado, channels: 4,
      background: fondo ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const png = await lienzo.composite([{ input: glifoPng, gravity: 'center' }]).png().toBuffer();
  writeFileSync(resolve(salida, archivo), png);
  console.log(`${archivo} · ${lado}px`);
}

mkdirSync(salida, { recursive: true });

// icon.png: el icono completo, con fondo. El glifo ocupa el 72 % del lienzo.
await pieza('icon.png', 1024, 0.72, PAPER);
// Pantalla de arranque: sin fondo, que lo pone expo-splash-screen desde app.config.ts.
await pieza('splash-icon.png', 512, 0.8, null);
// Adaptativo de Android: la capa de delante se recorta fuerte, así que el glifo ocupa menos.
await pieza('android-icon-foreground.png', 1024, 0.5, null);
await pieza('android-icon-background.png', 1024, 0, PAPER);
// Monocromo y notificación: Android solo usa el canal alfa, el color da igual mientras sea opaco.
await pieza('android-icon-monochrome.png', 1024, 0.5, null, '#FFFFFF');
await pieza('notification-icon.png', 96, 0.8, null, '#FFFFFF');
```

- [ ] **Step 4: Añadir el script a `package.json`**

En `mobile/package.json`, dentro de `"scripts"`, añade:

```json
    "iconos": "node scripts/generar-iconos.mjs",
```

- [ ] **Step 5: Generar los PNG**

```bash
cd oficios-cuba/mobile && npm run iconos
```

Esperado: seis líneas, una por archivo. Comprueba que los tamaños son los que dice:

```bash
cd oficios-cuba/mobile && node -e "
const sharp=require('sharp');
for (const f of ['icon','splash-icon','android-icon-foreground','android-icon-background','android-icon-monochrome','notification-icon'])
  sharp('assets/images/'+f+'.png').metadata().then(m=>console.log(f, m.width+'x'+m.height, 'alfa='+m.hasAlpha));
"
```

Esperado: `icon 1024x1024`, `splash-icon 512x512`, los tres `android-icon-* 1024x1024`, `notification-icon 96x96`.

- [ ] **Step 6: Actualizar `app.config.ts`**

En `mobile/app.config.ts`:

Línea 16 — el nombre visible:
```ts
  name: 'Encuentrauno',
```

Línea 29 — el fondo del icono adaptativo (deja `slug`, `scheme`, `package` y `bundleIdentifier` **intactos**):
```ts
      backgroundColor: '#FAF6EF',
```

Línea 41 — el color del canal de notificaciones:
```ts
    ['expo-notifications', { defaultChannel: 'mensajes', icon: './assets/images/notification-icon.png', color: '#FF7A00' }],
```

Y añade la pantalla de arranque, que **hoy no está configurada** (sin ella Expo pinta una por defecto que no es de la marca). En el array `plugins`, justo después de `'expo-router'`:

```ts
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', backgroundColor: '#FAF6EF', imageWidth: 200 }],
```

- [ ] **Step 7: Comprobar que la configuración sigue siendo válida**

```bash
cd oficios-cuba/mobile && npx expo config --type public 2>&1 | head -30
```

Esperado: imprime la configuración con `"name": "Encuentrauno"`, el bloque `splash` con `backgroundColor: "#FAF6EF"`, y **`"slug": "oficios-cuba"`** sin cambiar. Si `slug`, `scheme` o `package` han cambiado, revierte: romperían la actualización del APK instalado.

- [ ] **Step 8: Commit**

```bash
cd oficios-cuba
git add mobile/assets/marca mobile/assets/images mobile/scripts/generar-iconos.mjs mobile/package.json mobile/package-lock.json mobile/app.config.ts
git commit -m "Marca: iconos de la app generados desde el glifo de Encuentrauno

scripts/generar-iconos.mjs rasteriza assets/marca/glifo.svg con sharp,
para que el logo viva en un solo sitio. slug, scheme y package quedan
intactos: cambiarlos rompería la actualización del APK instalado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Filtro `kind` en `GET /providers`

**Files:**
- Modify: `backend/src/routes/providers.ts:79-95`
- Create: `backend/test/negocios.test.ts`

**Interfaces:**
- Consumes: `registrar`, `ponerPlan`, `api`, `db` de `backend/test/helpers.ts`.
- Produces: `GET /api/providers?kind=oficio|negocio`. La pestaña Negocios (Tarea 7) lo consume vía `providerApi.getAll({ kind: 'negocio' })`.

La regla que hay que respetar: `segunPlan()` (misma ruta, línea 61) ya devuelve `kind: 'oficio'` cuando el plan no incluye negocio. El SQL tiene que decir lo mismo, o un perfil que bajó de plan saldría en la pestaña Negocios con una tarjeta que se contradice.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `backend/test/negocios.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { api, db, ponerPlan, registrar } from './helpers.js';

function provinciaId() {
  return (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
}

/** Un perfil de plan Profesional marcado como negocio. */
async function crearNegocio(nombre: string) {
  const pro = await registrar('provider');
  ponerPlan(pro.providerId!, 'pro');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: nombre, province_id: provinciaId(), kind: 'negocio', contact_mode: 'whatsapp',
  });
  expect(res.status).toBe(200);
  return pro;
}

const ids = (body: { providers: { id: string }[] }) => body.providers.map((p) => p.id);

describe('filtrar el listado de proveedores por tipo', () => {
  it('kind=negocio devuelve los negocios y deja fuera los oficios', async () => {
    const negocio = await crearNegocio('Panadería del Sol');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?kind=negocio&limit=48');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(negocio.providerId);
    expect(ids(res.body)).not.toContain(oficio.providerId);
  });

  it('kind=oficio deja fuera a los negocios', async () => {
    const negocio = await crearNegocio('Cafetería La Esquina');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?kind=oficio&limit=48');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(oficio.providerId);
    expect(ids(res.body)).not.toContain(negocio.providerId);
  });

  // Review Focus 2: al bajar de plan, segunPlan() ya lo muestra como oficio.
  // Si el SQL no exigiera el plan, saldría en la pestaña Negocios contradiciendo su propia tarjeta.
  it('un negocio que baja al plan Básico deja de salir como negocio y pasa a oficio', async () => {
    const negocio = await crearNegocio('Barbería Central');
    ponerPlan(negocio.providerId!, 'basic');

    const comoNegocio = await api.get('/api/providers?kind=negocio&limit=48');
    expect(ids(comoNegocio.body)).not.toContain(negocio.providerId);

    const comoOficio = await api.get('/api/providers?kind=oficio&limit=48');
    expect(ids(comoOficio.body)).toContain(negocio.providerId);
  });

  it('sin kind salen los dos', async () => {
    const negocio = await crearNegocio('Ferretería del Puerto');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?limit=48');
    expect(ids(res.body)).toEqual(expect.arrayContaining([negocio.providerId!, oficio.providerId!]));
  });

  // Review Focus 3: un valor inventado no puede colarse en el SQL ni devolver el listado entero.
  it('rechaza un kind que no existe', async () => {
    const res = await api.get('/api/providers?kind=cualquiera');
    expect(res.status).toBe(400);
    expect(res.body.providers).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

```bash
cd oficios-cuba/backend && npx vitest run test/negocios.test.ts
```

Esperado: FALLAN. Las de `kind=negocio` y `kind=oficio` fallan porque el parámetro se ignora y devuelve todo; la del `kind` inventado falla porque responde 200 en vez de 400.

- [ ] **Step 3: Implementar el filtro**

En `backend/src/routes/providers.ts`, en el manejador `router.get('/')`:

Cambia la desestructuración (línea 79) para leer también `kind`:

```ts
  const { province_id, category, q, sort = 'relevance', kind } = queryTextos(req.query, ['province_id', 'category', 'q', 'sort', 'kind'] as const);
```

Y justo después de `const params: unknown[] = [];` (línea 85), añade:

```ts
  // El plan manda: segunPlan() muestra como oficio a quien no lo tenga incluido, así que el
  // SQL tiene que decir lo mismo o un perfil que bajó de plan saldría en la pestaña equivocada.
  const CON_NEGOCIO = "pp.subscription_plan IN ('pro', 'premium')";
  if (kind === 'negocio') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO}`;
  else if (kind === 'oficio') where += ` AND (pp.kind = 'oficio' OR NOT ${CON_NEGOCIO})`;
  else if (kind) throw new AppError('Tipo de perfil no válido', 400);
```

`AppError` ya está importado en este archivo.

- [ ] **Step 4: Correr las pruebas para verlas pasar**

```bash
cd oficios-cuba/backend && npx vitest run test/negocios.test.ts
```

Esperado: los 5 casos PASAN.

- [ ] **Step 5: Correr la suite entera y el typecheck**

```bash
cd oficios-cuba/backend && npm test && npm run typecheck
```

Esperado: todo pasa. No debería romperse nada: sin `kind` el comportamiento es idéntico al de antes.

- [ ] **Step 6: Commit**

```bash
cd oficios-cuba
git add backend/src/routes/providers.ts backend/test/negocios.test.ts
git commit -m "Proveedores: el listado acepta ?kind=oficio|negocio

Filtrar por negocio exige además el plan que lo incluye, para decir lo
mismo que segunPlan(): si no, un perfil que bajó de plan saldría en la
pestaña Negocios con una tarjeta que se contradice. Un kind inventado
da 400.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Ruta `/explorar` y menú

**Files:**
- Modify: `frontend/src/App.tsx:1,60-62`
- Modify: `frontend/src/components/Layout.tsx:101-104,149-153,207`

**Interfaces:**
- Consumes: nada.
- Produces: la ruta `/explorar`. La Tarea 7 edita la página que vive en ella.

- [ ] **Step 1: Añadir la redirección que conserva la query**

En `frontend/src/App.tsx`, justo antes de `function RequireAuth`, añade:

```tsx
// /buscar era la ruta vieja: se conserva la query entera para no romper enlaces compartidos.
function RedirigirAExplorar() {
  const { search } = useLocation();
  return <Navigate to={`/explorar${search}`} replace />;
}
```

`useLocation`, `Navigate` y `Route` ya están importados en la línea 2.

- [ ] **Step 2: Cambiar las rutas**

En `frontend/src/App.tsx`, reemplaza la línea `<Route path="buscar" element={<Search />} />` por:

```tsx
          <Route path="explorar" element={<Search />} />
          <Route path="buscar" element={<RedirigirAExplorar />} />
```

- [ ] **Step 3: Actualizar el menú y la barra inferior**

En `frontend/src/components/Layout.tsx`:

En `MobileTabBar`, la segunda pestaña (línea 102):
```tsx
    { to: '/explorar', label: 'Explorar', icon: Search },
```

En el menú de escritorio, el primer `NavLink` (líneas 149-151):
```tsx
              <NavLink to="/explorar" className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-semibold transition', isActive ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900')}>
                Explorar
              </NavLink>
```

Y **borra entero** el `NavLink` de `/profesionales` que va justo después (las tres líneas con `Profesionales`). La página sigue existiendo; se llega desde Explorar.

En el pie, la lista «Para clientes» (línea 207):
```tsx
                  <li><Link to="/explorar" className="hover:text-white">Explorar</Link></li>
```

- [ ] **Step 4: Comprobar que no queda ningún enlace a `/buscar` (Review Focus 1)**

```bash
cd oficios-cuba
grep -rn "'/buscar'\|\"/buscar\"\|to=\"/buscar\|href=\"/buscar" frontend/src
```

Esperado: **solo** la línea de `App.tsx` que declara la redirección. Cualquier otra es un enlace interno que debería apuntar ya a `/explorar`.

- [ ] **Step 5: Verificar la redirección con la query**

No hay tests de frontend, así que se comprueba sirviendo el build:

```bash
cd oficios-cuba/frontend && npm run build && npx vite preview --port 4173 &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/buscar?q=pan\&tab=productos
```

Esperado: `200` (es una SPA: el servidor devuelve `index.html` y la redirección ocurre en el cliente).

La comprobación que de verdad importa —que `/buscar?q=pan&tab=productos` acaba en `/explorar?q=pan&tab=productos` con los dos parámetros— **necesita un navegador**, y en vps2 chromium no arranca. Deja constancia en el commit de que está sin verificar en navegador y pídesela a Dariel. Mientras, revisa a ojo que `RedirigirAExplorar` usa `useLocation().search` y no reconstruye los parámetros a mano.

Acuérdate de matar el preview: `kill %1`.

- [ ] **Step 6: Compilar**

```bash
cd oficios-cuba/frontend && npx tsc --noEmit && npm run build
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
cd oficios-cuba
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "Explorar: /buscar pasa a /explorar y sale del menú Profesionales

La ruta vieja redirige conservando la query entera, para no romper los
enlaces ya compartidos. /profesionales sigue existiendo y se llega
desde Explorar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Tercera pestaña — Negocios

**Files:**
- Modify: `frontend/src/pages/Search.tsx:3,26-28,54-57,195-215,296-320,347-360`

**Interfaces:**
- Consumes: `GET /api/providers?kind=negocio` (Tarea 5) vía `providerApi.getAll`; los componentes `ProviderCard` y `ProviderCardSkeleton` de `components/cards`; el tipo `ProviderCard` de `types`.
  **Ojo:** el tipo y el componente se llaman igual. `cards.tsx` ya resuelve la colisión con `import type { ProviderCard as ProviderCardType }`; en `Search.tsx` hay que hacer lo mismo.
- Produces: nada. Es la hoja del árbol.

La página ya tiene el mecanismo: `tab` en la URL y un booleano `productos`. Se generaliza a tres valores en vez de añadir un segundo booleano, que es lo que haría que el componente se volviera ilegible.

- [ ] **Step 1: Generalizar la pestaña a tres valores**

En `frontend/src/pages/Search.tsx`, sustituye la constante de filtros de productos (líneas 26-28) por:

```ts
export type Pestaña = 'servicios' | 'productos' | 'negocios';
// En Productos solo cuenta la ubicación; en Negocios, ubicación y categoría.
// El precio y el tipo de precio son de los oficios y no aplican fuera de Servicios.
const FILTROS_POR_PESTAÑA: Record<Pestaña, readonly string[]> = {
  servicios: ['category', 'province', 'municipality', 'price_max', 'price_type'],
  productos: ['province', 'municipality'],
  negocios: ['category', 'province', 'municipality'],
};
```

Y borra las constantes `FILTER_KEYS` y `PRODUCT_FILTER_KEYS`, que quedan sustituidas.

- [ ] **Step 2: Cambiar `Filters` para que reciba la pestaña**

Reemplaza la firma y las dos condiciones de `Filters` (líneas 54-57 y las envolturas `{!productos && ...}`):

```tsx
function Filters({ categories, provinces, municipalities, get, update, onOpenMap, pestaña }: {
  categories: Category[]; provinces: Province[]; municipalities: Municipality[];
  get: (k: string) => string; update: (p: Record<string, string | null>) => void; onOpenMap: () => void; pestaña: Pestaña;
}) {
  const conCategoria = pestaña !== 'productos';
  const conPrecio = pestaña === 'servicios';
```

Cambia `{!productos && <FilterBlock title="Categoría">` por `{conCategoria && <FilterBlock title="Categoría">`, y el `{!productos && <>` que envuelve los dos bloques de precio por `{conPrecio && <>`.

- [ ] **Step 3: Leer la pestaña y cargar los negocios**

En el componente `Search`, sustituye la línea `const productos = get('tab') === 'productos';` por:

```tsx
  const tab = get('tab');
  const pestaña: Pestaña = tab === 'productos' || tab === 'negocios' ? tab : 'servicios';
  const productos = pestaña === 'productos';
  const negocios = pestaña === 'negocios';
  const [negs, setNegs] = useState<ProviderCardType[]>([]);
  const [negPag, setNegPag] = useState<Pagination | null>(null);
```

En el `import type` de `../types` (línea 5) añade el tipo **con alias**, porque choca con el componente del mismo nombre:

```tsx
import type { CatalogSearchItem, CatalogSearchPage, Category, Municipality, Pagination, PriceType, ProviderCard as ProviderCardType, Province, ServiceSummary } from '../types';
```

Y al `import` de `../services/api` (línea 4), añade `providerApi`. Importa también las tarjetas, junto al import de `ServiceCard` (línea 7):

```tsx
import { ProviderCard, ProviderCardSkeleton, ServiceCard, ServiceCardSkeleton } from '../components/cards';
```

En el `useEffect` que carga servicios, cambia la primera línea de `if (productos) return;` a `if (pestaña !== 'servicios') return;`.

Y añade este efecto justo después del de productos:

```tsx
  useEffect(() => {
    if (!negocios) return;
    let alive = true;
    setLoading(true);
    setError('');
    providerApi.getAll({
      kind: 'negocio',
      q: get('q') || undefined,
      category: get('category') || undefined,
      province_id: province || undefined,
      page: Number(get('page')) || 1,
      limit: PAGE_SIZE,
    })
      .then((r) => {
        if (!alive) return;
        setNegs(r.data.providers);
        setNegPag(r.data.pagination);
      })
      .catch((err) => alive && setError(apiError(err, 'No pudimos cargar los negocios.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [negocios, key, reload]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Aplicar la pestaña a los chips, los filtros y los textos**

Sustituye los chips condicionados a `!productos` para que usen la lista de la pestaña — así el punto 4 de Review Focus se cumple solo:

```tsx
  const filterKeys = FILTROS_POR_PESTAÑA[pestaña];
  const puesto = (k: string) => filterKeys.includes(k) && get(k);

  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (get('q')) chips.push({ key: 'q', label: `“${get('q')}”`, clear: { q: null } });
  if (puesto('category')) chips.push({ key: 'category', label: categoryLabel, clear: { category: null } });
  if (puesto('province')) chips.push({ key: 'province', label: provinces.find((p) => p.id === province)?.name ?? 'Provincia', clear: { province: null } });
  if (puesto('municipality')) chips.push({ key: 'municipality', label: municipalities.find((m) => m.id === get('municipality'))?.name ?? 'Municipio', clear: { municipality: null } });
  if (puesto('price_max')) chips.push({ key: 'price_max', label: `Hasta ${cup(Number(get('price_max')))}`, clear: { price_max: null } });
  if (puesto('price_type')) chips.push({ key: 'price_type', label: priceTypeLabel[get('price_type') as PriceType] ?? get('price_type'), clear: { price_type: null } });
```

Y borra la línea `const filterKeys: readonly string[] = productos ? PRODUCT_FILTER_KEYS : FILTER_KEYS;`, que acaba de quedar arriba.

Actualiza el título, las props de los filtros y los textos de resultados:

```tsx
  const TITULOS: Record<Pestaña, string> = { servicios: 'Explorar', productos: 'Explorar productos', negocios: 'Explorar negocios' };
  const title = pestaña === 'servicios'
    ? categoryLabel || (get('q') ? `Resultados para “${get('q')}”` : TITULOS.servicios)
    : (get('q') ? `${TITULOS[pestaña]}: “${get('q')}”` : TITULOS[pestaña]);
  const filterProps = { categories, provinces, municipalities, get, update, pestaña, onOpenMap: () => { setFiltersOpen(false); setMapOpen(true); } };
  const totalResultados = productos ? prod?.total : negocios ? negPag?.total : pagination?.total;
  const resultadosTexto = productos
    ? ['producto encontrado', 'productos encontrados']
    : negocios ? ['negocio encontrado', 'negocios encontrados'] : ['servicio encontrado', 'servicios encontrados'];
```

El `<select>` de orden y el buscador siguen condicionados: cambia `{!productos && <>` del bloque de orden por `{pestaña !== 'productos' && <>` (Negocios sí admite orden), y el `placeholder` del buscador:

```tsx
              placeholder={productos ? 'Cake, breaker, zapatos, pintura…' : negocios ? 'Panadería, cafetería, taller…' : 'Electricista, clases de inglés, arreglo de celulares…'}
```

- [ ] **Step 5: Poner la tercera pestaña en la barra**

Sustituye el `<div role="tablist">` y su contenido por:

```tsx
        <div className="mt-4 inline-grid grid-cols-3 gap-1 rounded-2xl bg-sand-100 p-1" role="tablist" aria-label="Qué buscar">
          {([['servicios', 'Servicios', Wrench], ['productos', 'Productos', Package], ['negocios', 'Negocios', Store]] as const).map(([valor, label, Icon]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestaña === valor}
              onClick={() => update({ tab: valor === 'servicios' ? null : valor })}
              className={cn('flex items-center justify-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-semibold transition', pestaña === valor ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
```

Añade `Store` al import de `lucide-react` (línea 3).

- [ ] **Step 6: Pintar los resultados de negocios**

Localiza el bloque que decide qué lista se muestra (el que alterna entre productos y servicios) y añade la rama de negocios antes de la de servicios, con la misma forma que ya tienen las otras dos:

```tsx
          ) : negocios ? (
            loading && negs.length === 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => <ProviderCardSkeleton key={i} />)}
              </div>
            ) : negs.length === 0 ? (
              <EmptyState
                icon={<SearchX className="h-7 w-7" />}
                title="No encontramos negocios"
                message="Prueba con otra provincia o sin filtros. Registrar un negocio es del plan Profesional, así que todavía hay pocos."
              />
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {negs.map((n) => <ProviderCard key={n.id} provider={n} />)}
                </div>
                {negPag && <Pager pagination={negPag} onPage={goPage} />}
              </>
            )
```

- [ ] **Step 7: Comprobar el punto 4 de Review Focus a ojo**

Revisa que `activeFilters` y `clearFilters` usan `filterKeys` (la lista de la pestaña) y no una lista fija. Con `?tab=negocios&price_max=5000` en la URL, `price_max` **no** debe contar como filtro activo ni salir como chip, porque no está en `FILTROS_POR_PESTAÑA.negocios`. Es el mismo comportamiento que ya tiene Productos con `category`.

- [ ] **Step 8: Compilar**

```bash
cd oficios-cuba/frontend && npx tsc --noEmit && npm run build
```

Esperado: sin errores. Si TypeScript se queja de que `FILTROS_POR_PESTAÑA[pestaña]` no es `readonly string[]`, es que falta el tipo `Record<Pestaña, readonly string[]>` del Step 1.

- [ ] **Step 9: Probar las tres pestañas contra la API de desarrollo**

Levanta el backend con datos de demostración y comprueba que las tres rutas responden:

```bash
cd oficios-cuba/backend && DEMO_MODE=true npm run dev &
sleep 6
curl -s "http://localhost:3000/api/providers?kind=negocio&limit=5" | head -c 300; echo
curl -s "http://localhost:3000/api/providers?kind=cualquiera" | head -c 200; echo
```

Esperado: la primera devuelve un objeto con `providers`; la segunda, un 400 con el mensaje «Tipo de perfil no válido».

Mata el backend al terminar: `kill %1`.

- [ ] **Step 10: Commit**

```bash
cd oficios-cuba
git add frontend/src/pages/Search.tsx
git commit -m "Explorar: tercera pestaña, Negocios

La pestaña pasa de un booleano a tres valores y cada una declara qué
filtros le aplican, así que los de Servicios dejan de contar al cambiar
de pestaña en vez de quedarse pegados en la URL.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Cierre de la entrega

- [ ] **Verificación completa**

```bash
cd oficios-cuba/backend && npm test && npm run typecheck
cd ../frontend && npx tsc --noEmit && npm run build
cd ../mobile && npx tsc --noEmit
cd .. && grep -rn "Oficios Cuba\|OficiosCuba" frontend/src frontend/index.html mobile/src mobile/app
```

Esperado: backend y frontend en verde, y el grep sin resultados.

- [ ] **Entrada en `STATUS.md`**

Añade al final, con el formato de las entradas existentes:

```
## <fecha> UTC — claude-code (vps2) — Entrega 1 de Encuentrauno: marca y Explorar
- Changes: <resumen + archivos tocados>
- Tests: pass|fail — <detalle; backend N pruebas, 5 nuevas en negocios.test.ts>
- Security: sin cambios de red ni de auth
- Next: entrega 2 (cuenta, aprobación y baneo)
- Blockers: sin verificación visual en navegador (en vps2 chromium no arranca, falta libatk-1.0.so.0)
```

- [ ] **Pendiente de Dariel, no de esta entrega**

1. **Comprobación visual** del logo, la paleta y las tres pestañas: no se puede hacer desde vps2.
2. **Republicar el APK** con `mobile/scripts/publicar-apk.sh` para que los iconos nuevos lleguen a los teléfonos.
3. **Push a `github.com/doniet/oficio`**: el repo es compartido con Doniet y esto es un cambio de marca; conviene avisarle antes.
