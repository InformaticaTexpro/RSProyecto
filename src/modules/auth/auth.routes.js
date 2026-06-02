'use strict';

/**
 * modules/auth/auth.routes.js
 *
 * Endpoints de autenticación:
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 *   POST /api/auth/refresh
 *   POST /api/auth/recuperar
 *   POST /api/auth/verificar-otp
 *   POST /api/auth/nueva-password
 *
 * Migrado desde: src/routes/auth.js + src/routes/recuperar.js
 */

const express                  = require('express');
const router                   = express.Router();
const jwt                      = require('jsonwebtoken');
const db                       = require('../../config/db');
const { verifyPasswordDjango } = require('../../utils/pbkdf2Django');
const { updateLastLogin, findByEmail, updatePassword } = require('../../models/usuario');
const { requireAuth }          = require('../../middlewares/requireAuth');
const { crearOtp, verificarOtp } = require('../../utils/otpStore');
const { enviarOtp }              = require('../../utils/mailer');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';
const RESET_TOKEN_TTL = '15m';

function generarResetToken(email) {
  return jwt.sign(
    { email, purpose: 'password_reset' },
    JWT_SECRET,
    { expiresIn: RESET_TOKEN_TTL }
  );
}

function verificarResetToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.purpose !== 'password_reset') throw new Error('Token no es de reset');
  return payload;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, usuario, password } = req.body;
  const emailFinal = (email || usuario || '').trim().toLowerCase();

  if (!emailFinal || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });
  }

  try {
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.password, u.area, u.is_admin, u.is_active
       FROM usuario u WHERE u.email = ? LIMIT 1`,
      [emailFinal]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    const match = verifyPasswordDjango(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    await updateLastLogin(user.id);
    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );
    const payload = {
      sub: user.id, email: user.email, nombre: user.nombre,
      area: user.area, is_admin: user.is_admin, vendedores,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, token, user: { ...payload } });
  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.area, u.is_admin, u.is_active
       FROM usuario u WHERE u.id = ? LIMIT 1`,
      [req.usuario.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }
    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );
    res.json({ ok: true, user: { ...user, vendedores } });
  } catch (err) {
    console.error('[GET /api/auth/me]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Sesión cerrada' });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }
  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
  const ahora = Math.floor(Date.now() / 1000);
  const expiracion = decoded.exp || 0;
  if (ahora - expiracion > 24 * 60 * 60) {
    return res.status(401).json({ ok: false, error: 'Token demasiado antiguo. Inicia sesión nuevamente.' });
  }
  try {
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.area, u.is_admin, u.is_active
       FROM usuario u WHERE u.id = ? LIMIT 1`,
      [decoded.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado' });
    }
    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );
    const nuevoPayload = {
      sub: user.id, email: user.email, nombre: user.nombre,
      area: user.area, is_admin: user.is_admin, vendedores,
    };
    const nuevoToken = jwt.sign(nuevoPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, token: nuevoToken });
  } catch (err) {
    console.error('[POST /api/auth/refresh]', err.message);
    res.status(500).json({ ok: false, error: 'Error al renovar sesión' });
  }
});

// ── POST /api/auth/recuperar ──────────────────────────────────────────────────
router.post('/recuperar', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email inválido.' });
    }
    const usuario = await findByEmail(email);
    if (usuario && usuario.is_active) {
      const codigo = await crearOtp(email);
      await enviarOtp(email, codigo);
    }
    return res.status(200).json({
      ok: true,
      message: 'Si el correo está registrado, recibirás el código en breve.',
    });
  } catch (err) {
    console.error('[recuperar/enviar-otp]', err);
    return res.status(500).json({ ok: false, error: 'Error al enviar el código.' });
  }
});

// ── POST /api/auth/verificar-otp ──────────────────────────────────────────────
router.post('/verificar-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp   = String(req.body.otp   || '').trim();
    if (!email || !otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ ok: false, error: 'Email y código de 6 dígitos son requeridos.' });
    }
    const valido = await verificarOtp(email, otp);
    if (!valido) {
      return res.status(401).json({ ok: false, error: 'Código incorrecto o expirado.' });
    }
    const resetToken = generarResetToken(email);
    return res.status(200).json({ ok: true, message: 'Código verificado correctamente.', resetToken });
  } catch (err) {
    console.error('[recuperar/verificar-otp]', err);
    return res.status(500).json({ ok: false, error: 'Error al verificar el código.' });
  }
});

// ── POST /api/auth/nueva-password ─────────────────────────────────────────────
router.post('/nueva-password', async (req, res) => {
  try {
    const { resetToken, password } = req.body;
    if (!resetToken || !password) {
      return res.status(400).json({ ok: false, error: 'Token y contraseña son requeridos.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener mínimo 8 caracteres.' });
    }
    let payload;
    try {
      payload = verificarResetToken(resetToken);
    } catch {
      return res.status(401).json({ ok: false, error: 'Token de restablecimiento inválido o expirado.' });
    }
    const actualizado = await updatePassword(payload.email, password);
    if (!actualizado) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado o inactivo.' });
    }
    return res.status(200).json({ ok: true, message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('[recuperar/nueva-password]', err);
    return res.status(500).json({ ok: false, error: 'Error al actualizar la contraseña.' });
  }
});

module.exports = router;
