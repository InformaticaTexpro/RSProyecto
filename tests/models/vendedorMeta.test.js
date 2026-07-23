'use strict';

const mockQuery = jest.fn();
jest.mock('../../src/config/db', () => ({
  pool: { query: mockQuery },
}));

const {
  buildPeriodoFecha,
  buildMetaDisplayInfo,
  mapMetaRow,
  obtenerMetaVendedor,
  obtenerMetaAnualVigente,
  listarMetasVendedor,
  guardarMetaVendedor,
} = require('../../src/models/vendedorMeta');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('vendedorMeta helpers', () => {
  test('buildPeriodoFecha normaliza mensual y anual', () => {
    expect(buildPeriodoFecha(2026, 3, 'mensual')).toBe('2026-03-01');
    expect(buildPeriodoFecha(2026, 9, 'anual')).toBe('2026-01-01');
  });

  test('obtenerMetaVendedor retorna la meta mensual prioritaria', async () => {
    mockQuery.mockResolvedValueOnce([[
      {
        id: 10,
        usuario_id: 5,
        fecha: '2026-03-01',
        meta: 1200,
        tipo_periodo: 'mensual',
        activo: 1,
        observacion: 'Marzo',
      },
    ]]);

    const meta = await obtenerMetaVendedor(5, 2026, 3);

    expect(meta).toMatchObject({
      id: 10,
      usuario_id: 5,
      meta: 1200,
      tipo_periodo: 'mensual',
      meta_mensual: 1200,
      activo: true,
    });
  });

  test('obtenerMetaAnualVigente calcula meta mensual efectiva', async () => {
    mockQuery.mockResolvedValueOnce([[
      {
        id: 11,
        usuario_id: 5,
        fecha: '2026-01-01',
        meta: 2400,
        tipo_periodo: 'anual',
        activo: 1,
        observacion: 'Año',
      },
    ]]);

    const meta = await obtenerMetaAnualVigente(5, 2026);

    expect(meta).toMatchObject({
      id: 11,
      tipo_periodo: 'anual',
      meta: 2400,
      meta_mensual: 2400,
      meta_mes: 2400,
      prorrateada: false,
    });
  });

  test('mapMetaRow conserva meta mensual sin prorratear', () => {
    expect(mapMetaRow({
      id: 12,
      usuario_id: 5,
      fecha: '2026-03-01',
      meta: 650000,
      tipo_periodo: 'mensual',
      activo: 1,
      observacion: '',
    })).toMatchObject({
      meta: 650000,
      meta_original: 650000,
      meta_mes: 650000,
      meta_mensual: 650000,
      prorrateada: false,
    });
  });

  test('mapMetaRow convierte metas con formato local a numero', () => {
    expect(mapMetaRow({
      id: 21,
      usuario_id: 8,
      fecha: '2026-07-01',
      meta: '28.354.273',
      tipo_periodo: 'mensual',
      activo: 1,
      observacion: '',
    })).toMatchObject({
      id: 21,
      meta: 28354273,
      meta_mensual: 28354273,
      meta_mes: 28354273,
      prorrateada: false,
    });
  });

  test('buildMetaDisplayInfo expone meta original, meta mes y prorrateo', () => {
    expect(buildMetaDisplayInfo({
      id: 31,
      usuario_id: 9,
      fecha: '2026-01-01',
      meta: 40613761,
      tipo_periodo: 'anual',
      activo: 1,
    })).toMatchObject({
      meta_original: 40613761,
      meta_mes: 40613761,
      tipo_periodo: 'anual',
      fecha: '2026-01-01',
      prorrateada: false,
    });
  });

  test('obtenerMetaVendedor prioriza la meta mensual sobre la anual', async () => {
    mockQuery.mockResolvedValueOnce([[
      {
        id: 22,
        usuario_id: 5,
        fecha: '2026-03-01',
        meta: 650000,
        tipo_periodo: 'mensual',
        activo: 1,
      },
      {
        id: 23,
        usuario_id: 5,
        fecha: '2026-01-01',
        meta: 40613761,
        tipo_periodo: 'anual',
        activo: 1,
      },
    ]]);

    const meta = await obtenerMetaVendedor(5, 2026, 3);

    expect(meta).toMatchObject({
      id: 22,
      tipo_periodo: 'mensual',
      meta_mes: 650000,
      prorrateada: false,
    });
  });

  test('listarMetasVendedor normaliza filas con usuario', async () => {
    mockQuery.mockResolvedValueOnce([[
      {
        id: 1,
        usuario_id: 5,
        fecha: '2026-03-01',
        meta: 1500,
        tipo_periodo: 'mensual',
        activo: 1,
        observacion: '',
        created_at: '2026-03-01',
        updated_at: '2026-03-01',
        usuario_nombre: 'Ana',
        usuario_email: 'ana@texpro.cl',
        usuario_area: 'ventas',
        usuario_codigo: '101',
      },
    ]]);

    const rows = await listarMetasVendedor({ usuario_id: 5 });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      usuario_nombre: 'Ana',
      meta_mensual: 1500,
      activo: true,
    });
  });

  test('guardarMetaVendedor inserta cuando no existe la tupla', async () => {
    mockQuery
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 77 }])
      .mockResolvedValueOnce([[
        {
          id: 77,
          usuario_id: 5,
          fecha: '2026-03-01',
          meta: 1500,
          tipo_periodo: 'mensual',
          activo: 1,
          observacion: 'Nueva',
        },
      ]]);

    const meta = await guardarMetaVendedor({
      usuario_id: 5,
      anio: 2026,
      mes: 3,
      meta: 1500,
      tipo_periodo: 'mensual',
      activo: true,
      observacion: 'Nueva',
    });

    expect(meta).toMatchObject({
      id: 77,
      meta: 1500,
      tipo_periodo: 'mensual',
    });
  });
});
