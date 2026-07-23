'use strict';

const { pool } = require('../config/db');

function normalizePeriodo(value) {
  const text = String(value ? '').trim().toLowerCase();
  if (['mensual', 'mes', 'm'].includes(text)) return 'mensual';
  if (['anual', 'ano', 'a', 'year'].includes(text)) return 'anual';
  return null;
}

function asNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;

  if (typeof value === 'string') {
    const compact = value.trim().replace(/[\s.,]/g, '');
    const parsedCompact = Number(compact);
    if (Number.isFinite(parsedCompact)) return parsedCompact;
  }

  return fallback;
}

function asBoolean(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function buildPeriodoFecha(anio, mes, tipoPeriodo) {
  const year = asNumber(anio, null);
  if (!Number.isFinite(year)) {
    const error = new Error('Año inválido');
    error.status = 400;
    throw error;
  }

  const periodo = normalizePeriodo(tipoPeriodo);
  if (periodo === 'mensual') {
    const month = asNumber(mes, null);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      const error = new Error('Mes inválido para meta mensual');
      error.status = 400;
      throw error;
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  }

  return `${String(year).padStart(4, '0')}-01-01`;
}

function mapMetaRow(row) {
  if (!row) return null;
  const tipoPeriodo = normalizePeriodo(row.tipo_periodo) || 'anual';
  const meta = asNumber(row.meta, 0) || 0;
  return {
    id: Number(row.id),
    usuario_id: Number(row.usuario_id),
    fecha: row.fecha || null,
    fecha_formateada: row.fecha ? String(row.fecha).slice(0, 10) : null,
    meta,
    meta_original: meta,
    tipo_periodo: tipoPeriodo,
    meta_mensual: meta,
    meta_mes: meta,
    prorrateada: false,
    activo: row.activo === undefined ? true : Boolean(Number(row.activo)),
    observacion: row.observacion || '',
    usuario_nombre: row.usuario_nombre || '',
    usuario_email: row.usuario_email || '',
    usuario_area: row.usuario_area || '',
    usuario_codigo: row.usuario_codigo || '',
  };
}

function buildMetaDisplayInfo(row) {
  const meta = mapMetaRow(row);
  if (!meta) return null;

  return {
    meta_original: meta.meta_original,
    meta_mes: meta.meta_mes,
    tipo_periodo: meta.tipo_periodo,
    fecha: meta.fecha_formateada,
    prorrateada: meta.prorrateada,
  };
}

async function obtenerMetaVendedor(usuarioId, anio, mes, conexion = pool) {
  const [rows] = await conexion.query(
    `SELECT id, usuario_id, fecha, meta, tipo_periodo, activo, observacion
     FROM vendedor_meta
     WHERE usuario_id = ?
       AND activo = 1
       AND (
         (tipo_periodo = 'mensual' AND YEAR(fecha) = ? AND MONTH(fecha) = ?)
         OR (tipo_periodo = 'anual' AND YEAR(fecha) = ?)
       )
     ORDER BY CASE WHEN tipo_periodo = 'mensual' THEN 0 ELSE 1 END, fecha DESC, id DESC
     LIMIT 1`,
    [usuarioId, anio, mes, anio]
  );

  return mapMetaRow(rows[0] || null);
}

async function obtenerMetaAnualVigente(usuarioId, anio, conexion = pool) {
  const [rows] = await conexion.query(
    `SELECT id, usuario_id, fecha, meta, tipo_periodo, activo, observacion
     FROM vendedor_meta
     WHERE usuario_id = ?
       AND activo = 1
       AND tipo_periodo = 'anual'
       AND YEAR(fecha) = ?
     ORDER BY fecha DESC, id DESC
     LIMIT 1`,
    [usuarioId, anio]
  );

  return mapMetaRow(rows[0] || null);
}

async function listarMetasVendedor(filtros = {}, conexion = pool) {
  const condiciones = [];
  const params = [];

  const usuarioId = asNumber(filtros.usuario_id, null);
  const anio = asNumber(filtros.anio, null);
  const mes = asNumber(filtros.mes, null);
  const periodo = normalizePeriodo(filtros.tipo_periodo);
  const activo = asBoolean(filtros.activo, null);

  if (Number.isFinite(usuarioId)) {
    condiciones.push('vm.usuario_id = ?');
    params.push(usuarioId);
  }

  if (Number.isFinite(anio)) {
    condiciones.push('YEAR(vm.fecha) = ?');
    params.push(anio);
  }

  if (Number.isFinite(mes)) {
    condiciones.push('MONTH(vm.fecha) = ?');
    params.push(mes);
  }

  if (periodo) {
    condiciones.push('vm.tipo_periodo = ?');
    params.push(periodo);
  }

  if (activo !== null) {
    condiciones.push('vm.activo = ?');
    params.push(activo ? 1 : 0);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [rows] = await conexion.query(
    `SELECT
       vm.id,
       vm.usuario_id,
       vm.fecha,
       vm.meta,
       vm.tipo_periodo,
       vm.activo,
       vm.observacion,
       vm.created_at,
       vm.updated_at,
       u.nombre AS usuario_nombre,
       u.email AS usuario_email,
       u.area AS usuario_area,
       u.codigo AS usuario_codigo
     FROM vendedor_meta vm
     LEFT JOIN usuario u ON u.id = vm.usuario_id
     ${where}
     ORDER BY vm.fecha DESC, CASE WHEN vm.tipo_periodo = 'mensual' THEN 0 ELSE 1 END, vm.id DESC`
    ,
    params
  );

  return rows.map(mapMetaRow);
}

async function guardarMetaVendedor(data, conexion = pool) {
  const usuarioId = asNumber(data.usuario_id, null);
  const meta = asNumber(data.meta, null);
  const tipoPeriodo = normalizePeriodo(data.tipo_periodo);
  const anio = asNumber(data.anio, null);
  const mes = asNumber(data.mes, null);
  const activo = data.activo === undefined || data.activo === null || data.activo === ''
    ? 1
    : (data.activo ? 1 : 0);
  const observacion = String(data.observacion ? '').trim();

  if (!Number.isFinite(usuarioId) || usuarioId <= 0) {
    const error = new Error('Usuario inválido');
    error.status = 400;
    throw error;
  }

  if (!Number.isFinite(meta) || meta < 0) {
    const error = new Error('Meta inválida');
    error.status = 400;
    throw error;
  }

  if (!tipoPeriodo) {
    const error = new Error('Tipo de período inválido');
    error.status = 400;
    throw error;
  }

  const fecha = buildPeriodoFecha(anio, mes, tipoPeriodo);

  const [existing] = await conexion.query(
    `SELECT id
     FROM vendedor_meta
     WHERE usuario_id = ?
       AND tipo_periodo = ?
       AND fecha = ?
     LIMIT 1`,
    [usuarioId, tipoPeriodo, fecha]
  );

  if (existing.length) {
    const id = Number(existing[0].id);
    await conexion.query(
      `UPDATE vendedor_meta
       SET meta = ?, activo = ?, observacion = ?
       WHERE id = ?`,
      [meta, activo, observacion || null, id]
    );
    const [rows] = await conexion.query(
      `SELECT id, usuario_id, fecha, meta, tipo_periodo, activo, observacion
       FROM vendedor_meta
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return mapMetaRow(rows[0] || null);
  }

  const [result] = await conexion.query(
    `INSERT INTO vendedor_meta (usuario_id, fecha, meta, tipo_periodo, activo, observacion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [usuarioId, fecha, meta, tipoPeriodo, activo, observacion || null]
  );

  const insertedId = Number(result.insertId || 0);
  const [rows] = await conexion.query(
    `SELECT id, usuario_id, fecha, meta, tipo_periodo, activo, observacion
     FROM vendedor_meta
     WHERE id = ?
     LIMIT 1`,
    [insertedId]
  );

  return mapMetaRow(rows[0] || null);
}

module.exports = {
  normalizePeriodo,
  buildPeriodoFecha,
  mapMetaRow,
  buildMetaDisplayInfo,
  obtenerMetaVendedor,
  obtenerMetaAnualVigente,
  listarMetasVendedor,
  guardarMetaVendedor,
};
