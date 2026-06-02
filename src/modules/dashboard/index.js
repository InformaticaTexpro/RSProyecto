'use strict';
/**
 * modules/dashboard/index.js
 *
 * El módulo de dashboard mantiene su router en dashboard.routes.js.
 * Por el tamaño del archivo (48kb), se referencia directamente
 * desde src/routes/dashboard.js hasta que se divida en sub-módulos.
 *
 * TODO: dividir en dashboard.ventas.routes.js, dashboard.produccion.routes.js, etc.
 */
module.exports = require('../../routes/dashboard');
