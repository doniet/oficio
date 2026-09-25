# STATUS — Oficios Cuba

## 2026-09-25 05:50 — claude-code (vps2) — Rediseño completo backend + frontend y despliegue local
- Changes: backend refactorizado (config central, stats, uploads con detección de firma, búsqueda/filtros, límites de plan, elegibilidad de reseñas, seed demo con 8 proveedores). Frontend reescrito entero: sistema de diseño, componentes (`ui`, `cards`, `ContactActions`, `ReviewList`), Layout/DashboardLayout, todas las páginas públicas (Home, Buscar, Profesionales, Planes, Servicio, Proveedor, Login, Registro, 404) y del panel (Resumen, Perfil, Mis servicios, Formulario, Mi plan, Mensajes, Conversación, Favoritos, Cuenta). Compose de producción: `oficio_web` (nginx, net_dmz + labels Traefik) y `oficio_api` en red interna sin salida.
- Tests: pass — `tsc` + build de imagen OK; E2E con Playwright (contenedor en net_dmz) a 390 px y 1280 px sobre 25 rutas: 0 errores de consola/red, 0 desbordes horizontales. Flujos con escritura OK: enviar mensaje, crear → listar → pausar → borrar servicio. Bugs arreglados en la verificación: regex sin comillas en nginx.conf (el contenedor no arrancaba), desborde del resumen del proveedor en móvil, barra inferior tapando la caja de texto del chat.
- Security: N/A cambios de superficie. Se intentó abrir `/api/uploads` a clientes (para su avatar) y se revirtió: queda pendiente de decisión de Dariel.
- Next:
  - Publicar `oficio.dardoit.com`: añadir Public Hostname en el túnel de la cuenta Doniet (`cloudflared_doniet`, gestionado desde el panel) → `http://traefik:80`. El router Traefik ya existe.
  - Decidir si los clientes pueden subir avatar (quitar `requireProvider` en `backend/src/routes/uploads.ts` y el `canUpload` de `Account.tsx`).
  - Definir datos de pago reales (cuenta de transferencia/contacto) antes de poner `DEMO_MODE=false`.
  - La conversación demo de `proveedor@demo.com` contiene un mensaje "Prueba E2E …" de la verificación.
- Blockers: el hostname del túnel requiere acceso al panel Cloudflare de Doniet (Dariel).
