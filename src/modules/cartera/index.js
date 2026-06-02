'use strict';
/**
 * modules/cartera/index.js
 *
 * Punto de entrada del módulo de cartera de clientes.
 * Redirige al router existente en src/routes/cartera.js
 *
 * Endpoints expuestos bajo /api/cartera:
 *   GET /api/cartera  — activos, inactivos, recuperados, sinCompras
 */

module.exports = require('../../routes/cartera');
