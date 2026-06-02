# Estructura del Proyecto — RSProyecto

## Arquitectura Modular

El proyecto está organizado en tres capas bien definidas:

```
src/
├── server.js                    ← Punto de entrada. Registra módulos y middleware global.
│
├── core/                        ← Infraestructura técnica (no es negocio)
│   ├── config/                  ← Configuración de BD, env, etc.
│   ├── database/                ← Conexiones a MySQL y Softland
│   ├── middlewares/             ← requireAuth, rateLimiter, etc.
│   ├── utils/                   ← Helpers reutilizables (stringHelpers, mailer, otpStore...)
│   └── tools/                   ← Herramientas internas
│
├── shared/                      ← Recursos compartidos entre módulos
│   └── models/                  ← Modelos de datos reutilizables entre módulos
│
└── modules/                     ← Módulos de negocio (1 carpeta = 1 dominio)
    ├── auth/                    ← Login + recuperación de contraseña
    │   └── index.js
    ├── ventas/
    │   └── index.js
    ├── dashboard/
    │   └── index.js
    ├── admin/
    │   └── index.js
    ├── notificaciones/
    │   └── index.js
    ├── cartera/
    │   └── index.js
    └── alertas/
        └── index.js
```

## Principios

- **`core/`** nunca importa de `modules/`. Solo al revés.
- **`modules/<módulo>/index.js`** es el único punto de entrada que `server.js` conoce.
- Agregar un nuevo módulo = crear `modules/<nuevo>/index.js` + una línea en `server.js`.
- Los archivos en `src/routes/` se mantienen como implementación interna de cada módulo
  durante la transición. En la siguiente fase, la lógica migrará completamente a
  `modules/<módulo>/` con su propio `routes.js`, `controller.js` y `model.js`.

## Próximos pasos (Fase 2)

Cuando un módulo crezca o necesite ser refactorizado internamente:

```
modules/ventas/
├── index.js          ← Exporta el router
├── ventas.routes.js  ← Define endpoints
├── ventas.controller.js ← Lógica de negocio
└── ventas.model.js   ← Queries SQL
```
