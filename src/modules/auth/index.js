'use strict';
/**
 * modules/auth/index.js
 *
 * Punto de entrada del módulo de autenticación.
 * Agrupa las rutas de login/refresh (auth.js) y
 * recuperación de contraseña (recuperar.js) bajo un mismo router.
 *
 * Endpoints expuestos bajo /api/auth:
 *   POST /api/auth/login
 *   POST /api/auth/refresh
 *   POST /api/auth/logout
 *   POST /api/auth/recuperar
 *   POST /api/auth/verificar-otp
 *   POST /api/auth/nueva-password
 */

const express    = require('express');
const router     = express.Router();

// Rutas de login / refresh / logout (anteriormente src/routes/auth.js)
const authRoutes      = require('../../routes/auth');
// Rutas de recuperación de contraseña (anteriormente src/routes/recuperar.js)
const recuperarRoutes = require('../../routes/recuperar');

router.use('/', authRoutes);
router.use('/', recuperarRoutes);

module.exports = router;
