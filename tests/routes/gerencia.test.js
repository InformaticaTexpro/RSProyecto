'use strict';

const request = require('supertest');
const express = require('express');

const mockUsuario = {
  sub: 1,
  id: 1,
  area: 'Gerencia',
  is_admin: false,
  vendedores: [],
};

jest.mock('../../src/middlewares/requireAuth', () => ({
  requireAuth: (req, _res, next) => {
    req.usuario = mockUsuario;
    next();
  },
}));

const mockMysqlQuery = jest.fn();
jest.mock('../../src/config/db', () => ({
  query: (...args) => mockMysqlQuery(...args),
}));

const consultasSoftland = [];
const entradasSoftland = [];
jest.mock('../../src/config/db.softland', () => ({
  getSoftlandPool: jest.fn().mockResolvedValue({
    request: () => ({
      input(nombre, tipo, valor) {
        entradasSoftland.push({ nombre, tipo, valor });
        return this;
      },
      async query(consulta) {
        consultasSoftland.push(consulta);
        if (consulta.includes('SUM(enc.SubTotal)')) {
          return {
            recordset: [
              { anio: 2022, mes: 1, ventas: 100 },
              { anio: 2023, mes: 1, ventas: 120 },
              { anio: 2024, mes: 1, ventas: 180 },
            ],
          };
        }
        if (consulta.includes('INTO #DetalleComercial')) {
          return {
            recordsets: [
              [{ cuentaCategoria: '3-1-01-001', venta: 180 }],
              [{ codigoCliente: 'C1', cliente: 'Cliente Uno', venta: 180 }],
              [{ codigoProducto: 'P1', producto: 'Producto Uno', cuentaCategoria: '3-1-01-001', venta: 180 }],
              [{ codigoVendedor: '001', nombreVendedor: 'Vendedor Uno', venta: 180, ventaReal: 200 }],
            ],
          };
        }
        if (consulta.includes('[ECGrupoT]')) {
          return {
            recordsets: [
              [
                { codigoVendedor: '001', descripcion: 'Principal Softland', neto: 180 },
                { codigoVendedor: '5001', descripcion: 'Asociado Softland', neto: 20 },
              ],
              [
                { codigoVendedor: '001', descripcion: 'Principal Softland', grupo: 'TEXPRO INTERNO' },
                { codigoVendedor: '5001', descripcion: 'Asociado Softland', grupo: 'OTRO GRUPO' },
              ],
            ],
          };
        }
        if (consulta.includes('GROUP BY producto.CtaVentas')) {
          return { recordset: [{ cuentaCategoria: '3-1-01-001', venta: 180 }] };
        }
        return { recordset: [{ MontoVenta: 180, MontoReal: 200 }] };
      },
    }),
  }),
}));

jest.mock('../../src/utils/precioHistorico', () => ({
  buildPrecioListaRealCASE: jest.fn().mockResolvedValue('t.PrecioVta'),
}));

const gerenciaRouter = require('../../src/routes/gerencia');
const app = express();
app.use('/api/gerencia', gerenciaRouter);

describe('Dashboard Comercial de Gerencia', () => {
  beforeEach(() => {
    mockUsuario.area = 'Gerencia';
    mockUsuario.is_admin = false;
    mockMysqlQuery.mockReset();
    mockMysqlQuery.mockImplementation(async (consulta) => {
      if (consulta.includes('FROM categoriasproducto')) {
        return [[{ cuenta: '3-1-01-001', categoria: 'Textil' }]];
      }
      if (consulta.includes('FROM usuario') && consulta.includes('usuario_vendedor')) {
        return [[
          { usuarioId: 10, codigoPrincipal: '001', vendedor: 'Vendedor Uno', codigoAsociado: '001', tipo: 'P' },
          { usuarioId: 10, codigoPrincipal: '001', vendedor: 'Vendedor Uno', codigoAsociado: '5001', tipo: 'P' },
        ]];
      }
      if (consulta.includes('MAX(meta)')) {
        return [[{ usuarioId: 10, metaMensual: 150 }]];
      }
      return [[]];
    });
    consultasSoftland.length = 0;
    entradasSoftland.length = 0;
  });

  test('bloquea áreas distintas de Gerencia', async () => {
    mockUsuario.area = 'Ventas';
    const respuesta = await request(app).get('/api/gerencia/comercial/resumen?anio=2024');
    expect(respuesta.status).toBe(403);
  });

  test('permite administradores aunque pertenezcan a otra área', async () => {
    mockUsuario.area = 'Ventas';
    mockUsuario.is_admin = true;
    const respuesta = await request(app).get('/api/gerencia/comercial/resumen?anio=2024');
    expect(respuesta.status).toBe(200);
  });

  test('valida año y mes obligatorios y razonables', async () => {
    expect((await request(app).get('/api/gerencia/comercial/resumen')).status).toBe(400);
    expect((await request(app).get('/api/gerencia/comercial/resumen?anio=abc')).status).toBe(400);
    expect((await request(app).get('/api/gerencia/comercial/mensual?anio=2024&mes=13')).status).toBe(400);
    expect((await request(app).get('/api/gerencia/comercial/estadisticas-ventas?anio=2024&mes=0')).status).toBe(400);
  });

  test('construye el comparativo de tres años y variaciones', async () => {
    const respuesta = await request(app).get('/api/gerencia/comercial/resumen?anio=2024');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.periodos).toEqual([2022, 2023, 2024]);
    expect(respuesta.body.data.comparativoMensual).toHaveLength(12);
    expect(respuesta.body.data.comparativoMensual[0]).toEqual({
      mes: 1,
      valores: [100, 120, 180],
      variaciones: [null, 20, 50],
    });
    expect(respuesta.body.data.resumen.porcentajeDescuento).toBe(10);
    expect(respuesta.body.data.totales.valores).toEqual([100, 120, 180]);
    expect(respuesta.body.data.categorias).toEqual([
      { categoria: 'Textil', venta: 180, participacion: 100 },
    ]);
    expect(mockMysqlQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM categoriasproducto'),
      ['3-1-01-001']
    );
  });

  test('usa parámetros mssql y filtros F, N, D sin interpolar año o mes', async () => {
    await request(app).get('/api/gerencia/comercial/resumen?anio=2024');
    expect(entradasSoftland.some(entrada => entrada.nombre === 'anioDesde' && entrada.valor === 2022)).toBe(true);
    expect(entradasSoftland.some(entrada => entrada.nombre === 'anioHasta' && entrada.valor === 2024)).toBe(true);
    expect(consultasSoftland.join('\n')).toContain("enc.Tipo IN ('F', 'N', 'D')");
    expect(consultasSoftland.join('\n')).toContain("enc.Estado <> 'A'");
    expect(consultasSoftland.join('\n')).not.toContain('YEAR(enc.Fecha) = 2024');
  });

  test('calcula meta, cumplimiento y descuento mensual', async () => {
    const respuesta = await request(app).get('/api/gerencia/comercial/mensual?anio=2024&mes=7');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toMatchObject({
      anio: 2024,
      mes: 7,
      ventaMes: 180,
      meta: 150,
      metaMes: 150,
      cumplimiento: 120,
      montoReal: 200,
      porcentajeDescuento: 10,
      metaDisponible: true,
      totalCategorias: 180,
    });
    expect(respuesta.body.data.clientes).toHaveLength(1);
    expect(respuesta.body.data.productos).toHaveLength(1);
    expect(respuesta.body.data.vendedores).toHaveLength(1);
    expect(respuesta.body.data.vendedores[0]).toMatchObject({
      codigoPrincipal: '001',
      vendedor: 'Vendedor Uno',
      venta: 180,
      ventaReal: 200,
      porcentajeDescuento: 10,
      meta: 150,
      cumplimiento: 120,
      cantidadCodigos: 2,
    });
    expect(respuesta.body.data.vendedores[0].codigos).toHaveLength(2);
    expect(respuesta.body.data.vendedores[0].codigos.reduce((suma, codigo) => suma + codigo.venta, 0)).toBe(180);
    expect(respuesta.body.data.vendedores[0].codigos.reduce((suma, codigo) => suma + codigo.meta, 0)).toBe(150);
    expect(mockMysqlQuery).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(MAX(meta), 0)'),
      [2024, 10]
    );
    const consultaMetaVendedor = mockMysqlQuery.mock.calls.find(([consulta]) => (
      consulta.includes('COALESCE(MAX(meta), 0)')
    ))[0];
    expect(consultaMetaVendedor).toContain('YEAR(fecha) = ?');
    expect(consultaMetaVendedor).not.toContain('MONTH(fecha)');
    expect(consultaMetaVendedor).not.toContain('/ 12');

    const otroMes = await request(app).get('/api/gerencia/comercial/mensual?anio=2024&mes=1');
    expect(otroMes.body.data.metaMes).toBe(150);
  });

  test('evita divisiones por cero', () => {
    expect(gerenciaRouter._helpers.porcentajeDescuento(100, 0)).toBeNull();
    expect(gerenciaRouter._helpers.variacion(100, 0)).toBeNull();
  });

  test('agrupa estadísticas por negocio y vendedor principal sin duplicar códigos', async () => {
    const respuesta = await request(app)
      .get('/api/gerencia/comercial/estadisticas-ventas?anio=2024&mes=7');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data).toMatchObject({
      anio: 2024,
      mes: 7,
      total: 200,
      resumen: {
        ventaTotal: 200,
        cantidadUnidades: 1,
        cantidadVendedores: 1,
        cantidadCodigos: 2,
      },
    });
    expect(respuesta.body.data.grupos).toHaveLength(1);
    expect(respuesta.body.data.grupos[0]).toMatchObject({
      grupo: 'TEXPRO INTERNO',
      total: 200,
    });
    expect(respuesta.body.data.grupos[0].vendedores).toHaveLength(1);
    const vendedor = respuesta.body.data.grupos[0].vendedores[0];
    expect(vendedor).toMatchObject({
      codigoPrincipal: '001',
      vendedor: 'Vendedor Uno',
      neto: 200,
      participacion: 100,
      cantidadCodigos: 2,
    });
    expect(vendedor.codigos.map(codigo => codigo.codigo)).toEqual(['001', '5001']);
    expect(vendedor.codigos.reduce((total, codigo) => total + codigo.neto, 0)).toBe(200);

    const consulta = consultasSoftland.find(sqlText => sqlText.includes('[ECGrupoT]'));
    expect(consulta).toContain('SUM(movimiento.TotLinea)');
    expect(consulta).toContain("encabezado.Tipo IN ('F', 'N', 'D')");
    expect(consulta).toContain("encabezado.Estado <> 'A'");
    expect(consulta).toContain('encabezado.Fecha >= @fechaDesde');
    expect(consulta).toContain('encabezado.Fecha < @fechaHasta');
    expect(consulta).toContain('ROW_NUMBER() OVER');
    expect(consulta).not.toContain('SELECT DISTINCT');
    expect(consulta).not.toContain('MONTH(encabezado.Fecha)');
    expect(entradasSoftland.some(entrada => entrada.nombre === 'fechaDesde')).toBe(true);
    expect(entradasSoftland.some(entrada => entrada.nombre === 'fechaHasta')).toBe(true);
  });

  test('asigna todos los códigos asociados al grupo del código principal', () => {
    const resultado = gerenciaRouter._helpers.consolidarEstadisticasVentas(
      [
        { codigoVendedor: '623', neto: 100 },
        { codigoVendedor: '647', neto: 200 },
        { codigoVendedor: '649', neto: 50 },
      ],
      [
        { codigoVendedor: '623', descripcion: 'VENTAS TA ONLINE', grupo: 'TEXPRO INTERNO' },
        { codigoVendedor: '647', descripcion: 'LUSBY RAMIREZ', grupo: 'VENTAS TERRENO 2025 (CM)' },
        { codigoVendedor: '649', descripcion: 'CARTERA CEDIDA', grupo: 'VENTAS TERRENO 2025 (CM)' },
      ],
      [
        { usuarioId: 38, codigoPrincipal: '647', vendedor: 'LUSBY RAMIREZ', codigoAsociado: '623' },
        { usuarioId: 38, codigoPrincipal: '647', vendedor: 'LUSBY RAMIREZ', codigoAsociado: '647' },
        { usuarioId: 38, codigoPrincipal: '647', vendedor: 'LUSBY RAMIREZ', codigoAsociado: '649' },
      ]
    );

    expect(resultado).toMatchObject({
      total: 350,
      cantidadUnidades: 1,
      cantidadVendedores: 1,
      cantidadCodigos: 3,
    });
    expect(resultado.grupos).toHaveLength(1);
    expect(resultado.grupos[0].grupo).toBe('VENTAS TERRENO 2025 (CM)');
    expect(resultado.grupos[0].vendedores).toHaveLength(1);
    expect(resultado.grupos[0].vendedores[0]).toMatchObject({
      codigoPrincipal: '647',
      vendedor: 'LUSBY RAMIREZ',
      neto: 350,
      cantidadCodigos: 3,
    });
    expect(resultado.grupos[0].vendedores[0].codigos.reduce(
      (total, codigo) => total + codigo.neto,
      0
    )).toBe(350);
  });

  test('clasifica códigos sin asociación como vendedores independientes en TEXPRO INTERNO', () => {
    const resultado = gerenciaRouter._helpers.consolidarEstadisticasVentas(
      [{ codigoVendedor: '900', descripcion: 'VENDEDOR SIN ASOCIACIÓN', neto: 1250 }],
      [{ codigoVendedor: '900', descripcion: 'VENDEDOR SIN ASOCIACIÓN', grupo: 'OTRO GRUPO' }],
      []
    );

    expect(resultado).toMatchObject({
      total: 1250,
      cantidadUnidades: 1,
      cantidadVendedores: 1,
      cantidadCodigos: 1,
    });
    expect(resultado.grupos[0]).toMatchObject({
      grupo: 'TEXPRO INTERNO',
      total: 1250,
    });
    expect(resultado.grupos[0].vendedores[0]).toMatchObject({
      codigoPrincipal: '900',
      vendedor: 'VENDEDOR SIN ASOCIACIÓN',
      neto: 1250,
      cantidadCodigos: 1,
    });
    expect(resultado.grupos[0].vendedores[0].codigos).toEqual([
      expect.objectContaining({
        codigo: '900',
        descripcion: 'VENDEDOR SIN ASOCIACIÓN',
        grupo: 'TEXPRO INTERNO',
        neto: 1250,
      }),
    ]);
  });

  test('mantiene ventas disponibles si falta vendedor_meta', async () => {
    const error = new Error("Table 'vendedor_meta' doesn't exist");
    error.code = 'ER_NO_SUCH_TABLE';
    mockMysqlQuery.mockImplementation(async (consulta) => {
      if (consulta.includes('FROM categoriasproducto')) {
        return [[{ cuenta: '3-1-01-001', categoria: 'Textil' }]];
      }
      if (consulta.includes('FROM usuario') && consulta.includes('usuario_vendedor')) {
        return [[
          { usuarioId: 10, codigoPrincipal: '001', vendedor: 'Vendedor Uno', codigoAsociado: '001', tipo: 'P' },
        ]];
      }
      if (consulta.includes('MAX(meta)')) throw error;
      return [[]];
    });
    const respuesta = await request(app).get('/api/gerencia/comercial/mensual?anio=2024&mes=7');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.ventaMes).toBe(180);
    expect(respuesta.body.data.metaMes).toBeNull();
    expect(respuesta.body.data.cumplimiento).toBeNull();
    expect(respuesta.body.data.metaDisponible).toBe(false);
  });
});
