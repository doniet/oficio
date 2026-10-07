# Catálogo de DardoVentas en Encuentrauno

Fecha: 2026-10-06 · Revisado: 2026-10-07 · Estado: **diseño aprobado en lo esencial, plan escrito**

Traer a Encuentrauno el catálogo de productos de los negocios que usan DardoVentas (el punto de
venta Android de Doniet), de forma que cada negocio aparezca en el mapa con sus productos, el
catálogo se mantenga al día solo, y las fotos se sirvan a demanda sin duplicarlas.

## Lo que la investigación cambió del encargo original

El encargo partía de tres supuestos y los tres resultaron falsos. Conviene dejarlos escritos porque
explican por qué el diseño es el que es:

1. **DardoVentas no guarda ninguna coordenada**, ni en el registro de negocios, ni en las salvas, ni
   en la app. Y su política de privacidad publicada promete expresamente que la app no recoge ni
   transmite ubicación, con la ficha de Google Play declarando lo mismo.
2. **No son 22 negocios: son 11**, de los cuales sólo 5 sincronizan. Los otros llevan de 7 a 45 días
   parados. 2611 productos en total, 2340 activos.
3. **«Punto de venta» no existe como entidad.** Un negocio es una entrada con N teléfonos, que son
   cajas del mismo local. No hay sucursales, así que es un pin por negocio, no uno por caja.

La decisión que desbloqueó el diseño: **la ficha (ubicación, dirección, contacto, horario) la recoge
Encuentrauno, no DardoVentas.** La app sigue sin tocar ubicación y su política no cambia por ese
motivo. DardoVentas sólo aporta el catálogo y la prueba de que quien reclama el negocio es su dueño.

## Consecuencia: no hay entidades externas

Si el comerciante se registra en Encuentrauno y rellena su propia ficha con su propio consentimiento,
entonces **es una cuenta de Encuentrauno normal** con el catálogo importado. Eso descarta el diseño
que se había considerado antes (tablas `negocios_externos` / `productos_externos`, vista
materializada y `UNION` en el mapa) por sobrante:

| Se consideró | Por qué se descarta |
|---|---|
| Tablas separadas para negocios y productos externos | Son `provider_profiles` y `catalog_items` de siempre |
| Vista materializada + `UNION` en `routes/mapa.ts` | El mapa funciona sin tocarlo |
| Peso propio en el ranking | Rankean por su plan, como cualquiera |
| Lista curada de ids en la configuración | El consentimiento lo da el comerciante al vincular |
| Emparejar duplicados entre los dos sistemas | Por construcción es una sola cuenta |
| Un `tipo` nuevo en el punto del mapa | Son `kind='negocio'`; además un `tipo` desconocido tumbaría la APK 0.2.5 ya publicada (`PIN_POR_TIPO[punto.tipo]` es un acceso por índice) |

## Contrato con DardoVentas (acordado, sin construir)

Acordado entre las dos partes técnicas. **Nada de esto existe todavía** y depende del OK de Doniet,
que abarca tres cosas: el endpoint público, el cambio en `/privacidad` y en la ficha de Play, y la
migración previa de las salvas.

**Activación.** El admin del negocio (login Google) pulsa «Publicar mi catálogo en Encuentrauno» en
`mi.dardoventas.com` y acepta un texto de consentimiento. El servidor crea un `slug` público opaco
(aleatorio de 128 bits, sin relación con el `systemId`) y un código de un solo uso con TTL ~15 min, y
abre `https://oficio.dardoit.com/vincular/dardoventas?code=…`.

🚨 El `systemId` **no se puede publicar nunca**: hoy funciona como credencial al portador — en 7 de
los 11 negocios abre la salva completa (ventas, costos, usuarios) sin firma. De ahí el slug aparte.

**Canje.** `POST https://ventas.dardoit.com/api/pub/link {code}` → `{ok, slug, businessName}`.
Autenticado con secreto compartido entre servidores (cabecera) además del código.

**Catálogo.** `GET /api/pub/catalog/<slug>`, JSON gzip, **lista completa sin paginar**, con `ETag` y
`schema_version` en la raíz. Campos: `uid`, `name`, `description`, `category`, `priceSource`,
`priceCup`, `priceUsd`, `disponible`, `updatedAt` y la URL completa de la foto. La ausencia de un
`uid` significa borrado — por eso la lista tiene que ser completa, para no inventar un mecanismo de
bajas. `disponible = stock > 0 && active`; la cantidad no se publica nunca.

**Fotos.** `GET /api/pub/foto/<slug>/<uid>.jpg?v=<photoAt>`, `Cache-Control: public, max-age=31536000,
immutable`. Si `?v=` no es la versión vigente, 301 a la buena; 404 si la foto ya no existe. Son
miniaturas de 256 px y calidad 50 (1,6–11,8 KB; 12 MB en total): las originales no salen del teléfono.

**Baja.** Si el admin desactiva en `mi`, `catalog` responde **410** y Encuentrauno retira el negocio y
sus productos. También se puede desvincular desde el lado de Encuentrauno.

**Cadencia.** Sondeo cada 30–60 min con `If-None-Match`. La salva sólo sube si cambió y cada 6 h, así
que sondear más a menudo es desperdicio.

### Los precios no se convierten

El CUP que se cobra en el mostrador **no sale de una tasa global**: sale de la configuración de cada
negocio (tasa propia manual o automática, más un incremento opcional, más redondeo al alza). El
servidor de DardoVentas calcula `priceCup` con esa misma función y lo manda ya resuelto.

**Encuentrauno muestra `priceCup` tal cual y no convierte.** Convertir con la tasa de elTOQUE
(`/api/tasas`) produciría una cifra distinta de la que el cliente paga en caja, y el comerciante
pensaría que uno de los dos sistemas está roto. Si `priceSource = "usd"`, se puede enseñar además el
`priceUsd` como referencia.

Efecto lateral aceptado: `priceCup` cambia cuando cambia la tasa del negocio aunque el catálogo no
cambie, así que la tasa entra en la huella del `ETag` y habrá alguna re-descarga de más al día.

## Lado Encuentrauno

### Modelo de datos (migración nueva)

En `provider_profiles`:
- `dardoventas_slug text UNIQUE` — `NULL` = no vinculado.
- `dardoventas_linked_at timestamptz`, `dardoventas_etag text`, `dardoventas_synced_at timestamptz`.

En `catalog_items`:
- `origen text NOT NULL DEFAULT 'propio' CHECK (origen IN ('propio','dardoventas'))`
- `uid_externo text`
- `CREATE UNIQUE INDEX ... ON catalog_items (provider_id, uid_externo) WHERE uid_externo IS NOT NULL`
  — es lo que hace la sincronización idempotente.

### Candados

Tres, y los tres son necesarios para que la sincronización no destruya datos ni mienta:

1. **Los artículos importados no se editan a mano.** `PUT`, `DELETE` y `PATCH /:id/available` de
   `routes/catalog.ts` rechazan los de `origen='dardoventas'`: cualquier edición se perdería en la
   siguiente pasada, lo que es peor que no dejar editar.
2. **Ninguna conversión de moneda en los importados.** `precioCatalogo()` (`shared/src/formato.ts:75`)
   siempre calcula el equivalente en la otra moneda. Vive en `shared/`, así que afecta a la web y a
   las dos apps. Hay que añadir un campo aditivo al artículo (p. ej. `convertible: boolean`) y
   respetarlo en los tres clientes.
3. **`borrarSiHuerfana` no toca las imágenes externas.** Esa función borra del disco la foto que ya
   no usa nadie; la de un artículo importado no está en disco y su ruta no es un `upload`.

### Flujo de vínculo

1. `GET /vincular/dardoventas?code=…` — ruta **pública** del frontend: el admin puede llegar sin
   sesión. Sin sesión → registro/login conservando el `code` y vuelta a esa URL.
2. `POST /api/dardoventas/vincular {code}` (sólo proveedor) → la API **apunta** el canje en
   `dardoventas_canjes` y responde 202. El canje servidor a servidor lo hace `oficio_notifier`, que
   guarda el `slug`, regala el plan y dispara la primera sincronización. La página consulta
   `GET /api/dardoventas/estado` hasta ver el resultado.
3. El comerciante rellena su ficha reusando `/dashboard/perfil`. Ahí decide `show_on_map` y
   `map_precision`: el consentimiento de publicar su ubicación es suyo y ya existe el aparato. Va
   **después** del canje y no antes, porque el código caduca a los ~15 min.

🚨 **`oficio_api` no tiene salida a internet** (vive en `oficio_net`, sin gateway). Por eso el canje
lo hace `oficio_notifier`, con el mismo patrón que ya usan Telegram y el push: la API apunta, el
notificador sale.

_Revisado el 2026-10-07._ La primera versión de este spec sacaba el canje por un
`server { listen 8081; }` nuevo en `oficio_web`. Se descartó al escribir el plan, por dos motivos:
`oficio_web` está en `net_dmz`, la red que comparten todos los proyectos de vps2, así que ese puerto
habría sido un proxy de salida autenticado contra DardoVentas al alcance de cualquier contenedor de
vps2, protegido sólo por un `allow` de subred; y el secreto compartido habría tenido que vivir en la
API o en nginx. Con el notificador no se abre ningún puerto nuevo y el secreto sólo lo lee un
proceso, el que ya es el único con salida.

El egress de vps2 es dual-stack **con IPv6 prioritario**: si algún día DardoVentas filtra por IP,
tiene que contemplar IPv6.

### Sincronizador

Vive **dentro de `oficio_notifier`**, que ya corre y ya está en las dos redes (`net_dmz` para salir,
`oficio_net` para la base). Cero contenedores nuevos: vps2 lleva 46 contenedores, 1,7 GB de swap en
uso y el disco al 79 %.

Cada 30–60 min, por cada perfil con `dardoventas_slug`, en **una transacción por negocio** (no una
global, que bloquearía la tabla durante toda la pasada):

- `If-None-Match` con el `etag` guardado → **304**: nada que hacer.
- **410** → desvincular: limpiar el slug, retirar sus artículos y poner `show_on_map = false`. La
  cuenta de Encuentrauno sigue existiendo (es suya), pero el comerciante retiró el consentimiento
  en `mi` y el negocio sale del mapa hasta que él lo vuelva a marcar. Desvincular desde
  Encuentrauno, en cambio, no toca `show_on_map`: ahí lo decide él en el mismo panel.
- **200** → upsert por `(provider_id, uid_externo)`, borrar los `uid` ausentes, guardar el `etag`
  nuevo, y llamar a `aplicarLimiteDePlan()` para recalcular `hidden_by_plan`.
- Error de red o 5xx → retroceso exponencial, sin tocar nada. Un fallo del otro lado no puede vaciar
  un catálogo.

### Fotos a demanda

`location ^~ /ext/dv/foto/` en `frontend/nginx.conf`, con `proxy_cache`, **`max_size` obligatorio**
(el disco está al 79 %: sin tope, la caché crece hasta llenarlo) y `proxy_cache_use_stale`, igual que
ya se hace con `/api/tasas`. El `^~` no es decorativo: en nginx una `location` por regex gana a un
prefijo sin él, y sin `^~` las fotos darían 404 en producción — ya pasó con `/assets/` y `/demo/`.

`catalog_items.image` guarda la ruta local `/ext/dv/foto/<slug>/<uid>.jpg?v=<photoAt>`. Como `photoAt`
va en la clave de caché, cambiar la foto invalida la entrada sola.

### Plan de los comerciantes vinculados

Decisión de Dariel: **Profesional regalado mientras dure la integración.** Al vincular se pone
`subscription_plan='pro'` con `subscription_expires_at` en una fecha de configuración
(`DARDOVENTAS_PRO_HASTA`). El job de caducidad existente (`db/index.ts:140`) degrada a `free` y
recalcula los límites solo al llegar esa fecha: no hace falta maquinaria nueva.

Es necesario que sea `pro`: `CON_CATALOGO_SQL` exige `basic` o `pro` para que el catálogo se vea, y
`CON_NEGOCIO_SQL` exige `pro` para salir como negocio en el mapa. Además el tope `maxCatalog` del
Básico son 50 artículos y la mediana de DardoVentas es 197, con un máximo de 784.

**Efecto conocido y aceptado:** `PLAN_WEIGHT_SQL` es el primer criterio de orden del mapa y sólo sale
un punto por celda, así que un comerciante vinculado le gana el sitio a un profesional cubano que
paga y que comparta celda con él. Si el efecto se nota, el knob es distinguir el pro regalado del pro
pagado dentro de `PLAN_WEIGHT_SQL`, sin tocar nada más.

## Degradaciones conocidas

- **Las APKs ya publicadas (0.2.5 y anteriores) mostrarán un equivalente en USD aproximado y
  posiblemente equivocado** en los artículos importados, porque el candado de conversión es un campo
  nuevo que esas versiones no conocen. No es un fallo: la cifra va rotulada «≈». Se corrige en la
  siguiente APK, y no se puede corregir hacia atrás.
- **Las fotos son de 256 px y calidad 50.** Se ven pobres por encima de ~128 px de lado, y las
  originales no están en el servidor de DardoVentas. Las tarjetas de producto tienen que dimensionarse
  para eso.
- **El stock siempre irá atrasado.** `disponible` sale de la última salva o del ledger, y el stock
  cambia con cada venta.
- **Las categorías no se pueden mapear bien.** `category` es texto libre y los dos catálogos más
  grandes la tienen vacía. Entra como `section` del artículo, que es texto libre también; no se
  intenta traducirla a las categorías de Encuentrauno.

## Riesgos del otro lado que condicionan el arranque

Salen del informe del propio servidor de DardoVentas y no se resuelven desde Encuentrauno:

- **Leer provoca escrituras.** `photoIndex()` reescribe la salva al primer acceso para migrar las
  fotos en base64. Quedan 3 negocios sin migrar: si uno se activa, la primera petición pública
  dispara una escritura en producción. La migración va **antes** y como paso aparte.
- **Un solo proceso Node de 9722 líneas** atiende la sincronización de los 11 negocios, con 1 GB de
  límite y ~2,1 GB libres en el host. La sección pública necesita su propio `try/catch`, caché
  obligatoria, interruptor por variable de entorno y caché de Cloudflare delante.
- **Datos sensibles mezclados con el catálogo:** `costPrice`/`costUsd` (margen), `supplier`, `stock`;
  y en `localSettings`, hashes de PIN y **números de tarjeta**. La salida pública se construye campo
  a campo con lista blanca, nunca con un spread del objeto.
- **El rate limiting por IP se puede falsear**: la IP sale del primer valor de `X-Forwarded-For` y,
  detrás de Cloudflare, ese valor lo controla el cliente.

## Fuera de alcance

- Cualquier cambio en la APK de DardoVentas o en su política de privacidad: es de Doniet.
- Mapear las categorías de DardoVentas a las de Encuentrauno.
- Mostrar stock numérico, costos, proveedor o cualquier dato que no esté en la lista blanca.
- Sucursales o varios puntos por negocio: no existen en el modelo de origen.

## Criterios de aceptación

1. Un negocio vinculado aparece en el mapa como `kind='negocio'`, con la ubicación que **él** fijó y
   la precisión que **él** eligió.
2. Su catálogo se ve en la pestaña Productos y en su ficha, con los precios **idénticos** a los que
   cobra el POS, sin equivalente convertido.
3. Un artículo importado no se puede editar ni borrar desde el panel del proveedor.
4. Borrar un producto en el POS lo retira de Encuentrauno en la siguiente pasada.
5. Desactivar la publicación en `mi` (410) retira el negocio y sus productos.
6. Con el catálogo sin cambios, una pasada de sincronización hace **una** petición y recibe 304.
7. Si `ventas.dardoit.com` está caído, el catálogo ya importado se sigue viendo y las fotos en caché
   se siguen sirviendo. Ningún catálogo se vacía por un fallo del otro lado.
8. La caché de fotos no supera su `max_size`.
9. El APK publicado (0.2.5) no se rompe con los datos nuevos.

## Precisiones del contrato (2026-10-07)

Lo que el contrato de arriba dejaba sin fijar y el lado de Encuentrauno necesita exacto. El lado de
DardoVentas tiene que implementarlo así, o avisar para cambiar el de acá.

- **Cabecera del canje:** `Authorization: Bearer <secreto compartido>`. El secreto es una cadena
  aleatoria de al menos 32 bytes, distinta del `systemId` y de cualquier otra credencial.
- **Respuestas del canje:** `200 {"ok": true, "slug": "…", "businessName": "…"}`. Código
  desconocido, caducado o ya usado: `400`, `404`, `409` o `410`, indistintamente. Secreto
  incorrecto: `401`.
- **Código de vínculo:** `^[A-Za-z0-9_-]{22,128}$` (al menos 128 bits aleatorios en base64url), de un solo uso y con TTL de 15 min.
- **`slug`:** `^[A-Za-z0-9_-]{16,64}$` (128 bits en base64url son 22 caracteres).
- **`uid`:** `^[A-Za-z0-9_-]{1,64}$`. Un artículo con otro `uid` se ignora.
- **Raíz del catálogo:** `{"schema_version": 1, "items": [ … ]}`. Otro `schema_version` se trata
  como error: no se toca nada.
- **Artículo:** `uid` (cadena), `name` (cadena no vacía), `description` (cadena o `null`),
  `category` (cadena o `null`), `priceSource` (`"cup"` o `"usd"`), `priceCup` (número ≥ 0 o
  `null`; `null` se muestra «A consultar»), `priceUsd` (número o `null`), `disponible` (booleano),
  `updatedAt` (ISO 8601), `photoUrl` (cadena o `null`).
- **`photoUrl`:** exactamente `<origen>/api/pub/foto/<slug>/<uid>.jpg?v=<versión>`, con
  `versión` en `^[A-Za-z0-9_-]{1,32}$`. Cualquier otra forma se trata como «sin foto».
- **Tamaño:** el catálogo descomprimido no puede pasar de 5 MB ni de 5000 artículos; por encima,
  la pasada falla sin tocar nada.

## Estado

- **Encuentrauno**: plan en `docs/superpowers/plans/2026-10-07-dardoventas-catalogo.md`. Se
  construye y se prueba contra un doble del contrato; no se puede dar por terminado sin el endpoint
  real.
- **DardoVentas**: falta el endpoint público, el cambio en `/privacidad` y en la ficha de Play, y la
  migración previa de las 3 salvas.
