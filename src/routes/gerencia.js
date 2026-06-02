'use strict';
/**
 * routes/gerencia.js
 *
 * Endpoints del módulo de Gerencia.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/requireAuth');

function requireGerencia(req, res, next) {
  if (req.usuario?.is_admin || req.usuario?.area === 'gerencia') {
    return next();
  }
  return res.status(403).json({ ok: false, error: 'Acceso restringido al área de gerencia.' });
}

router.use(requireAuth, requireGerencia);

router.get('/status', async (_req, res) => {
  try {
    res.json({
      ok: true,
      modulo: 'gerencia',
      mensaje: 'Módulo Gerencia activo',
      fecha: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GERENCIA] Error interno:', err);
    res.status(500).json({ ok: false, error: 'Error interno del módulo Gerencia' });
  }
});

module.exports = router;
