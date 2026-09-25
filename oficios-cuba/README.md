# Oficios Cuba - Marketplace de Servicios

Plataforma para publicar y buscar oficios/servicios en Cuba, con modelo de negocio basado en suscripciones para proveedores.

## Características Principales

### Para Clientes
- 🔍 **Búsqueda inteligente** por categoría, provincia, municipio, precio
- 🗺️ **Selector de provincia con mapa OpenStreetMap** interactivo
- ⭐ **Sistema de reseñas y calificaciones** reales
- 💬 **Chat directo** con proveedores
- ❤️ **Favoritos** para guardar proveedores
- 📱 **Diseño responsive** optimizado para móvil

### Para Proveedores
- 📝 **Perfil profesional** completo (negocio, descripción, ubicación, experiencia)
- 🛠️ **Publicación de servicios** con fotos, precios, categorías
- 📊 **Dashboard** con estadísticas y gestión
- 💳 **Planes de suscripción** (Gratuito, Básico $9.99, Pro $19.99, Premium $39.99)
- 🔔 **Notificaciones** de nuevos mensajes y reseñas
- 🎯 **Área de servicio** configurable por municipios

### Cobertura Nacional
- 15 provincias + Isla de la Juventud
- Todos los municipios de Cuba
- Selección de ubicación via mapa OpenStreetMap
- Geolocalización automática (opcional)

## Stack Tecnológico

### Backend
- **Node.js + Express + TypeScript**
- **SQLite** (better-sqlite3) - Base de datos embebida
- **JWT** para autenticación
- **Zod** para validación
- **OpenStreetMap/Nominatim** para geocodificación

### Frontend
- **React 18 + TypeScript + Vite**
- **Tailwind CSS** para estilos
- **React Router v6** para navegación
- **React Leaflet** para mapas interactivos
- **Zustand** para estado global
- **Axios** para API calls
- **Lucide React** para iconos

## Estructura del Proyecto

```
oficios-cuba/
├── backend/
│   ├── src/
│   │   ├── routes/          # Rutas API (auth, provinces, categories, providers, services, etc.)
│   │   ├── middleware/      # Auth, error handling
│   │   ├── db/             # Esquema SQLite + seed data
│   │   ├── services/       # Lógica de negocio
│   │   └── index.ts        # Entry point
│   ├── data/               # Base de datos SQLite
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Layout, ProvinceMapSelector
│   │   ├── pages/          # Home, Search, ServiceDetail, ProviderProfile, Dashboard, Auth
│   │   ├── hooks/          # useAuth
│   │   ├── services/       # API client
│   │   ├── types/          # TypeScript interfaces
│   │   └── App.tsx         # Rutas principales
│   ├── public/
│   └── package.json
└── README.md
```

## Instalación y Ejecución

### Requisitos
- Node.js 18+
- npm 9+

### Backend
```bash
cd backend
npm install
npm run db:init    # Inicializa la base de datos
npm run db:seed    # Pobla con provincias, municipios, categorías de Cuba
npm run dev        # Servidor en http://localhost:3000
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Servidor en http://localhost:5173
```

## Variables de Entorno (Backend)

```env
PORT=3000
NODE_ENV=development
DATABASE_PATH=./data/oficios.db
JWT_SECRET=tu-secret-super-seguro
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PLAN_BASIC_PRICE=9.99
PLAN_PRO_PRICE=19.99
PLAN_PREMIUM_PRICE=39.99
```

## API Endpoints Principales

### Autenticación
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Usuario actual
- `PUT /api/auth/profile` - Actualizar perfil

### Provincias y Ubicación
- `GET /api/provinces` - Todas las provincias
- `GET /api/provinces/:id` - Provincia con municipios
- `GET /api/provinces/search/osm?lat=&lng=` - Geocodificación inversa

### Categorías
- `GET /api/categories` - Árbol de categorías
- `GET /api/categories/flat` - Lista plana

### Proveedores
- `GET /api/providers` - Listar con filtros
- `GET /api/providers/featured` - Destacados
- `GET /api/providers/:id` - Perfil público
- `POST/PUT /api/providers/profile` - Mi perfil (auth)

### Servicios
- `GET /api/services` - Buscar servicios
- `GET /api/services/:id` - Detalle
- `POST/PUT/DELETE /api/services` - CRUD (provider auth)

### Suscripciones
- `GET /api/subscriptions/plans` - Planes disponibles
- `GET /api/subscriptions/me` - Mi suscripción
- `POST /api/subscriptions/checkout` - Crear checkout
- `POST /api/subscriptions/cancel` - Cancelar

### Conversaciones
- `GET /api/conversations` - Mis conversaciones
- `POST /api/conversations` - Iniciar conversación
- `GET/POST /api/conversations/:id/messages` - Mensajes

### Reseñas
- `POST /api/reviews` - Crear reseña
- `GET /api/reviews/provider/:id` - Reseñas de proveedor

### Favoritos
- `GET /api/favorites` - Mis favoritos
- `POST/DELETE /api/favorites/:providerId` - Agregar/quitar

## Modelo de Datos

### Provincias de Cuba (16)
Pinar del Río, Artemisa, La Habana, Mayabeque, Matanzas, Cienfuegos, Villa Clara, Sancti Spíritus, Ciego de Ávila, Camagüey, Las Tunas, Granma, Holguín, Santiago de Cuba, Guantánamo, Isla de la Juventud

### Categorías de Servicios (13 principales + subcategorías)
1. Construcción y Reformas
2. Reparaciones del Hogar
3. Servicios Técnicos
4. Automotriz
5. Belleza y Cuidado Personal
6. Limpieza y Mantenimiento
7. Transporte y Mudanzas
8. Eventos y Entretenimiento
9. Clases y Tutorías
10. Salud y Bienestar
11. Servicios Profesionales
12. Alimentos y Bebidas
13. Moda y Costura

## Planes de Suscripción

| Plan | Precio/mes | Servicios | Características |
|------|-----------|-----------|-----------------|
| Gratuito | $0 | 1 | Perfil básico |
| Básico | $9.99 | 5 | Perfil básico, soporte email |
| Profesional | $19.99 | Ilimitados | Destacado, stats básicas, soporte prioritario |
| Premium | $39.99 | Ilimitados | Top 3 búsquedas, stats avanzadas, badge verificado, 24/7 |

## Despliegue en Producción

1. Configurar base de datos PostgreSQL/MySQL (cambiar better-sqlite3)
2. Configurar variables de entorno seguras
3. Configurar HTTPS y dominio
4. Configurar Stripe/webhooks para pagos reales
5. Configurar CDN para imágenes
6. Configurar logging y monitoreo

## Licencia

Proyecto privado - Oficios Cuba 2024