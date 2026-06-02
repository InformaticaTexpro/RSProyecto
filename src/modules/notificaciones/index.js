'use strict';
/**
 * modules/notificaciones/index.js
 *
 * Punto de entrada del módulo de notificaciones.
 * Redirige al router existente en src/routes/notificaciones.js
 *
 * Endpoints expuestos bajo /api/notificaciones:
 *   GET  /api/notificaciones
 *   GET  /api/notificaciones/contador
 *   PATCH /api/notificaciones/:id/leer
 *   PATCH /api/notificaciones/leer-todo
 */

module.exports = require('../../routes/notificaciones');
