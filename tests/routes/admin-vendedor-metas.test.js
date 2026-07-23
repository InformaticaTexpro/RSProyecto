'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../../src/middlewares/requireAuth', () => ({
  requireAuth: (req, _res, next) => {
    req.usuario = { sub: 1, id: 1, is_admin: true, nombre: 'Admin Test' };
    next();
  },
}));

const mockGetConnection = jest.fn();
jest.mock('../../src/config/db', () => ({
  pool: { getConnection: mockGetConnection },
}));

const adminRouter = require('../../src/routes/admin');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

let state;
let mockConnection;

function resetState() {
  state = {
    users: [
      {
        id: 5,
        nombre: 'Claudia Rincones',
        email: 'crincones@texpro.cl',
        codigo: '501',
        area: 'ventas',
        is_admin: 0,
        is_active: 1,
        last_login: null,
        created_at: '2026-07-01 09:00:00',
      },
    ],
    metas: [
      {
        id: 1,
        usuario_id: 5,
        fecha: '2026-01-01',
        meta: 2400,
        tipo_periodo: 'anual',
        activo: 1,
        observacion: 'Base anual',
      },
    ],
    nextMetaId: 2,
  };
}

function cloneRows(rows) {
  return rows.map(row => ({ ...row }));
}

function joinMeta(meta) {
  const user = state.users.find(item => Number(item.id) === Number(meta.usuario_id));
  return {
    ...meta,
    usuario_nombre: user?.nombre || '',
    usuario_email: user?.email || '',
    usuario_area: user?.area || '',
    usuario_codigo: user?.codigo || '',
  };
}

function handleQuery(sql, params = []) {
  const normalized = String(sql).replace(/\s+/g, ' ').trim();

  if (normalized.startsWith('SELECT u.id, u.nombre, u.email, u.codigo, u.area, u.is_admin, u.is_active, u.last_login, u.fecha_creacion AS created_at FROM usuario u')) {
    if (normalized.includes('WHERE u.id = ?')) {
      return [cloneRows(state.users.filter(user => Number(user.id) === Number(params[0])))];
    }
    return [cloneRows(state.users)];
  }

  if (normalized.startsWith('SELECT id, usuario_id, fecha, meta, tipo_periodo, activo, observacion FROM vendedor_meta WHERE id = ? LIMIT 1')) {
    const meta = state.metas.find(item => Number(item.id) === Number(params[0]));
    return [[meta ? { ...meta } : undefined].filter(Boolean)];
  }

  if (normalized.startsWith('SELECT id FROM usuario WHERE id = ? LIMIT 1')) {
    const user = state.users.find(item => Number(item.id) === Number(params[0]));
    return [[user ? { id: user.id } : undefined].filter(Boolean)];
  }

  if (normalized.includes('FROM vendedor_meta vm LEFT JOIN usuario u ON u.id = vm.usuario_id')) {
    return [state.metas.map(joinMeta)];
  }

  if (normalized.startsWith('SELECT id FROM vendedor_meta WHERE usuario_id = ? AND tipo_periodo = ? AND fecha = ? LIMIT 1')) {
    const [usuarioId, tipoPeriodo, fecha] = params;
    const meta = state.metas.find(item => Number(item.usuario_id) === Number(usuarioId) && item.tipo_periodo === tipoPeriodo && item.fecha === fecha);
    return [[meta ? { id: meta.id } : undefined].filter(Boolean)];
  }

  if (normalized.startsWith('INSERT INTO vendedor_meta (usuario_id, fecha, meta, tipo_periodo, activo, observacion) VALUES (?, ?, ?, ?, ?, ?)')) {
    const [usuarioId, fecha, meta, tipoPeriodo, activo, observacion] = params;
    const inserted = {
      id: state.nextMetaId++,
      usuario_id: Number(usuarioId),
      fecha,
      meta: Number(meta),
      tipo_periodo: tipoPeriodo,
      activo: Number(activo),
      observacion,
    };
    state.metas.push(inserted);
    return [{ insertId: inserted.id }];
  }

  if (normalized.startsWith('UPDATE vendedor_meta SET fecha = ?, meta = ?, tipo_periodo = ?, activo = ?, observacion = ? WHERE id = ?')) {
    const [fecha, meta, tipoPeriodo, activo, observacion, id] = params;
    const row = state.metas.find(item => Number(item.id) === Number(id));
    if (row) {
      row.fecha = fecha;
      row.meta = Number(meta);
      row.tipo_periodo = tipoPeriodo;
      row.activo = Number(activo);
      row.observacion = observacion;
    }
    return [{ affectedRows: row ? 1 : 0 }];
  }

  if (normalized.startsWith('UPDATE vendedor_meta SET activo = 1 WHERE id = ?')) {
    const row = state.metas.find(item => Number(item.id) === Number(params[0]));
    if (row) row.activo = 1;
    return [{ affectedRows: row ? 1 : 0 }];
  }

  if (normalized.startsWith('UPDATE vendedor_meta SET activo = 0 WHERE id = ?')) {
    const row = state.metas.find(item => Number(item.id) === Number(params[0]));
    if (row) row.activo = 0;
    return [{ affectedRows: row ? 1 : 0 }];
  }

  return [[]];
}

beforeEach(() => {
  resetState();
  mockConnection = {
    query: jest.fn(handleQuery),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };
  mockGetConnection.mockResolvedValue(mockConnection);
});

describe('GET /api/admin/vendedor-metas', () => {
  test('lista metas con datos del usuario', async () => {
    const res = await request(app).get('/api/admin/vendedor-metas');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      usuario_nombre: 'Claudia Rincones',
      tipo_periodo: 'anual',
    });
  });
});

describe('POST /api/admin/vendedor-metas', () => {
  test('crea una meta mensual', async () => {
    const res = await request(app).post('/api/admin/vendedor-metas').send({
      usuario_id: 5,
      anio: 2026,
      mes: 3,
      meta: 1200,
      tipo_periodo: 'mensual',
      observacion: 'Meta de marzo',
      activo: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      usuario_id: 5,
      tipo_periodo: 'mensual',
      meta: 1200,
    });
    expect(state.metas).toHaveLength(2);
  });
});

describe('PUT /api/admin/vendedor-metas/:id', () => {
  test('permite cambiar el tipo de periodo y la fecha', async () => {
    const res = await request(app).put('/api/admin/vendedor-metas/1').send({
      usuario_id: 5,
      anio: 2026,
      mes: 3,
      meta: 3000,
      tipo_periodo: 'mensual',
      observacion: 'Ajustada a mensual',
      activo: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toMatchObject({
      id: 1,
      tipo_periodo: 'mensual',
      fecha: '2026-03-01',
      meta: 3000,
    });
    expect(state.metas[0]).toMatchObject({
      fecha: '2026-03-01',
      tipo_periodo: 'mensual',
      meta: 3000,
    });
  });
});

describe('PATCH /api/admin/vendedor-metas/:id/desactivar', () => {
  test('desactiva la meta existente', async () => {
    const res = await request(app).patch('/api/admin/vendedor-metas/1/desactivar');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.activo).toBe(false);
    expect(state.metas[0].activo).toBe(0);
  });
});
