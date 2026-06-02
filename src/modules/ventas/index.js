'use strict';
/**
 * modules/ventas/index.js
 *
 * Módulo principal de ventas.
 * Registra sus propias rutas y monta el submódulo dashboard.
 */
const router    = require('express').Router();
const ventas    = require('./ventas.routes');
const dashboard = require('./dashboard');

// Rutas propias de ventas
router.use('/', ventas);

// Submódulo dashboard  →  /api/ventas/dashboard/...
router.use('/dashboard', dashboard);

module.exports = router;
