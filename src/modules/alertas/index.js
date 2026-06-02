'use strict';
/**
 * modules/alertas/index.js
 *
 * Punto de entrada del módulo de alertas.
 * Redirige al router existente en src/routes/alertas.js
 *
 * Endpoints expuestos bajo /api/alertas:
 *   GET    /api/alertas
 *   GET    /api/alertas/contador
 *   GET    /api/alertas/badge
 *   GET    /api/alertas/pendientes
 *   GET    /api/alertas/usuarios
 *   POST   /api/alertas
 *   PUT    /api/alertas/:id
 *   PATCH  /api/alertas/:id/completar
 *   PATCH  /api/alertas/:id/silenciar
 *   PATCH  /api/alertas/:id/descartar-hoy
 *   PATCH  /api/alertas/:id/registrar-recordatorio
 *   DELETE /api/alertas/:id
 */

module.exports = require('../../routes/alertas');
