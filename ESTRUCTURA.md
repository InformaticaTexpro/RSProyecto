# Estructura del Proyecto — RSProyecto

## Arquitectura Modular

```
src/
├── server.js                         ← Punto de entrada. Solo registra módulos y middleware global.
│
├── config/                           ← Configuración de conexiones (db, db.softland)
├── middlewares/                      ← requireAuth, requireAdmin, rateLimiter
├── models/                           ← Modelos de datos reutilizables entre módulos
├── utils/                            ← Helpers globales (stringHelpers, mailer, otpStore...)
│
├── routes/
│   └── dashboard.js                  ← Pendiente migrar en Fase 3 (archivo muy grande)
│
└── modules/                          ← Módulos de negocio (1 carpeta = 1 dominio)
    ├── auth/
    │   ├── index.js                  ← Exporta el router
    │   └── auth.routes.js            ← Login, logout, refresh, recuperar contraseña
    ├── ventas/
    │   ├── index.js
    │   └── ventas.routes.js
    ├── dashboard/
    │   └── index.js                  ← Apunta a routes/dashboard.js (pendiente Fase 3)
    ├── admin/
    │   ├── index.js
    │   └── admin.routes.js
    ├── notificaciones/
    │   ├── index.js
    │   └── notificaciones.routes.js
    ├── cartera/
    │   ├── index.js
    │   └── cartera.routes.js
    └── alertas/
        ├── index.js
        └── alertas.routes.js
```

## Principios

- `server.js` solo conoce `modules/<módulo>/index.js`. Nunca importa de `routes/` directamente.
- Cada `index.js` es el único punto de entrada público del módulo.
- Los imports dentro de cada módulo apuntan a `../../config/`, `../../middlewares/`, etc.
- `routes/dashboard.js` se mantiene temporalmente hasta la Fase 3.

## Estado de Migración

| Módulo | Estado |
|---|---|
| auth (login + recuperar) | ✅ Migrado a modules/auth/auth.routes.js |
| ventas | ✅ Migrado a modules/ventas/ventas.routes.js |
| admin | ✅ Migrado a modules/admin/admin.routes.js |
| notificaciones | ✅ Migrado a modules/notificaciones/notificaciones.routes.js |
| cartera | ✅ Migrado a modules/cartera/cartera.routes.js |
| alertas | ✅ Migrado a modules/alertas/alertas.routes.js |
| dashboard | ⏳ Pendiente Fase 3 (archivo 48kb, requiere división en sub-rutas) |
