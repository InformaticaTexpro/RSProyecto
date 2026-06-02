'use strict';

/**
 * modules/alertas/alertas.routes.js
 *
 * Migrado desde: src/routes/alertas.js
 * Imports actualizados a rutas relativas dentro de src/
 */

const express         = require('express');
const router          = express.Router();
const { pool: db }    = require('../../config/db');
const { requireAuth } = require('../../middlewares/requireAuth');

router.use(requireAuth);

function diasRestantes(fechaVence) {
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaVence); vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence - hoy) / 86400000);
}

function debeRecordar(ultimoRec, frecuencia) {
  if (!ultimoRec || frecuencia === 'siempre') return true;
  const hoy    = new Date(); hoy.setHours(0, 0, 0, 0);
  const ultimo = new Date(ultimoRec); ultimo.setHours(0, 0, 0, 0);
  const diff   = Math.floor((hoy - ultimo) / 86400000);
  if (frecuencia === 'diaria')    return diff >= 1;
  if (frecuencia === 'semanal')   return diff >= 7;
  if (frecuencia === 'quincenal') return diff >= 15;
  return true;
}

// GET /api/alertas
router.get('/', async (req, res) => {
  const uid = req.usuario.sub;
  try {
    const [rows] = await db.query(`
      SELECT a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.frecuencia_recordatorio, a.id_creador, a.activa, a.completada, a.created_at,
        COALESCE(u.nombre, '') AS nombre_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        (SELECT GROUP_CONCAT(du.nombre ORDER BY du.nombre SEPARATOR ', ')
          FROM alerta_destinatarios adc JOIN usuario du ON du.id = adc.id_usuario
          WHERE adc.id_alerta = a.id) AS destinatarios_nombres,
        (SELECT GROUP_CONCAT(adc2.id_usuario ORDER BY adc2.id_usuario SEPARATOR ',')
          FROM alerta_destinatarios adc2 WHERE adc2.id_alerta = a.id) AS destinatarios_ids
      FROM alertas a
      LEFT JOIN usuario u ON u.id = a.id_creador
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE a.id_creador = ?
        OR EXISTS (SELECT 1 FROM alerta_destinatarios adx WHERE adx.id_alerta = a.id AND adx.id_usuario = ?)
      ORDER BY a.activa DESC, a.completada ASC, a.fecha_vence ASC
    `, [uid, uid, uid]);
    const data = rows.map(r => ({
      ...r,
      dias_restantes: diasRestantes(r.fecha_vence),
      destinatarios_ids: r.destinatarios_ids ? r.destinatarios_ids.split(',').map(Number) : [],
    }));
    res.json({ ok: true, data });
  } catch (e) {
    console.error('[alertas GET]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas' });
  }
});

// GET /api/alertas/contador
router.get('/contador', async (req, res) => {
  const uid = req.usuario.sub;
  try {
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total FROM alertas a
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE a.activa = 1 AND a.completada = 0
        AND DATEDIFF(a.fecha_vence, CURDATE()) BETWEEN 0 AND 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (a.id_creador = ? OR EXISTS (SELECT 1 FROM alerta_destinatarios adx WHERE adx.id_alerta = a.id AND adx.id_usuario = ?))
    `, [uid, uid, uid]);
    res.json({ ok: true, total });
  } catch (e) {
    console.error('[alertas contador]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener contador' });
  }
});

// GET /api/alertas/badge
router.get('/badge', async (req, res) => {
  const uid = req.usuario.sub;
  try {
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total FROM alertas a
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE a.activa = 1 AND a.completada = 0
        AND DATEDIFF(a.fecha_vence, CURDATE()) BETWEEN 0 AND 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (a.id_creador = ? OR EXISTS (SELECT 1 FROM alerta_destinatarios adx WHERE adx.id_alerta = a.id AND adx.id_usuario = ?))
    `, [uid, uid, uid]);
    res.json({ ok: true, total });
  } catch (e) {
    console.error('[alertas badge]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener badge' });
  }
});

// GET /api/alertas/pendientes
router.get('/pendientes', async (req, res) => {
  const uid = req.usuario.sub;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const [rows] = await db.query(`
      SELECT a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.frecuencia_recordatorio, a.id_creador,
        COALESCE(u.nombre, '') AS nombre_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        COALESCE(ad.ultimo_recordatorio, NULL) AS ultimo_recordatorio
      FROM alertas a
      LEFT JOIN usuario u ON u.id = a.id_creador
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE a.activa = 1 AND a.completada = 0
        AND a.fecha_vence >= CURDATE()
        AND DATEDIFF(a.fecha_vence, CURDATE()) <= 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (ad.descartada_hoy IS NULL OR ad.descartada_hoy != ?)
        AND (a.id_creador = ? OR EXISTS (SELECT 1 FROM alerta_destinatarios adx WHERE adx.id_alerta = a.id AND adx.id_usuario = ?))
      ORDER BY a.fecha_vence ASC
    `, [uid, hoy, uid, uid]);
    const data = rows
      .filter(r => debeRecordar(r.ultimo_recordatorio, r.frecuencia_recordatorio))
      .map(r => ({ ...r, dias_restantes: diasRestantes(r.fecha_vence) }));
    res.json({ ok: true, data });
  } catch (e) {
    console.error('[alertas pendientes]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas pendientes' });
  }
});

// GET /api/alertas/usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT id, nombre, area FROM usuario WHERE is_active = 1 ORDER BY nombre ASC`);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[alertas usuarios]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

module.exports = router;
