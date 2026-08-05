'use strict';

/**
 * API del Dashboard Comercial de Gerencia.
 *
 * Reutiliza las reglas vigentes de Ventas:
 * - F, N y D se suman con el signo almacenado por Softland.
 * - Los documentos anulados se excluyen.
 * - El monto Real usa el precio de lista histórico de precioHistorico.js.
 * - Descuento = (1 - MontoVenta / MontoReal) * 100.
 */

const express = require('express');
const sql = require('mssql');

const db = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');
const { requireAuth } = require('../middlewares/requireAuth');
const { buildPrecioListaRealCASE } = require('../utils/precioHistorico');

const router = express.Router();
const GRUPO_CODIGOS_SIN_ASOCIACION = 'TEXPRO INTERNO';

function normalizarArea(valor) {
  return String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function requireGerenciaOrAdmin(req, res, next) {
  const admin = req.usuario?.is_admin === true
    || req.usuario?.is_admin === 1
    || req.usuario?.is_admin === '1'
    || normalizarArea(req.usuario?.area) === 'admin';

  if (!admin && normalizarArea(req.usuario?.area) !== 'gerencia') {
    return res.status(403).json({
      ok: false,
      error: 'Acceso restringido a Gerencia o administradores.',
    });
  }
  next();
}

function validarAnio(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new Error('El año es obligatorio.');
  }
  const anio = Number(valor);
  const maximo = new Date().getFullYear() + 1;
  if (!Number.isInteger(anio) || anio < 2000 || anio > maximo) {
    throw new Error(`El año debe ser un entero entre 2000 y ${maximo}.`);
  }
  return anio;
}

function validarMes(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new Error('El mes es obligatorio.');
  }
  const mes = Number(valor);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error('El mes debe ser un entero entre 1 y 12.');
  }
  return mes;
}

function porcentajeDescuento(montoVenta, montoReal) {
  const venta = Number(montoVenta || 0);
  const real = Number(montoReal || 0);
  if (!Number.isFinite(real) || real === 0) return null;
  return Math.round((1 - (venta / real)) * 10000) / 100;
}

function variacion(actual, anterior) {
  const base = Number(anterior || 0);
  if (base === 0) return null;
  return Math.round(((Number(actual || 0) - base) / base) * 10000) / 100;
}

function participacion(venta, total) {
  const base = Number(total || 0);
  if (base === 0) return 0;
  return Math.round((Number(venta || 0) / base) * 10000) / 100;
}

function normalizarDistribucion(rows, campoNombre) {
  const items = (rows || []).map(fila => ({
    ...fila,
    venta: Math.round(Number(fila.venta || 0)),
  })).sort((a, b) => b.venta - a.venta);
  const total = items.reduce((suma, item) => suma + item.venta, 0);
  return {
    total,
    items: items.map(item => ({
      ...item,
      [campoNombre]: String(item[campoNombre] || '').trim() || 'Sin información',
      participacion: participacion(item.venta, total),
    })),
  };
}

function aplicarTotalDistribucion(items, total) {
  return (items || []).map(item => ({
    ...item,
    participacion: participacion(item.venta, total),
  }));
}

async function obtenerCategoriasPorCuenta(cuentas) {
  const cuentasUnicas = [...new Set(
    (cuentas || []).map(cuenta => String(cuenta || '').trim()).filter(Boolean)
  )];
  if (!cuentasUnicas.length) return new Map();

  const placeholders = cuentasUnicas.map(() => '?').join(',');
  const [rows] = await db.query(`
    SELECT
      TRIM(Cta) AS cuenta,
      TRIM(Categoria) AS categoria
    FROM categoriasproducto
    WHERE Cta IN (${placeholders})
  `, cuentasUnicas);

  return new Map(rows.map(fila => [
    String(fila.cuenta || '').trim(),
    String(fila.categoria || '').trim() || 'Sin categoría',
  ]));
}

async function clasificarVentasPorCategoria(rows, categoriasPorCuenta = null) {
  const mapaCategorias = categoriasPorCuenta || await obtenerCategoriasPorCuenta(
    (rows || []).map(fila => fila.cuentaCategoria)
  );
  const ventasPorCategoria = new Map();

  (rows || []).forEach(fila => {
    const cuenta = String(fila.cuentaCategoria || '').trim();
    const categoria = mapaCategorias.get(cuenta) || 'Sin categoría';
    ventasPorCategoria.set(
      categoria,
      Number(ventasPorCategoria.get(categoria) || 0) + Number(fila.venta || 0)
    );
  });

  return normalizarDistribucion(
    Array.from(ventasPorCategoria, ([categoria, venta]) => ({ categoria, venta })),
    'categoria'
  );
}

async function obtenerVentasComparativas(anioSeleccionado, mesLimite) {
  const anioDesde = anioSeleccionado - 2;
  const pool = await getSoftlandPool();
  const result = await pool.request()
    .input('anioDesde', sql.Int, anioDesde)
    .input('anioHasta', sql.Int, anioSeleccionado)
    .input('mesLimite', sql.Int, mesLimite)
    .query(`
      SELECT
        YEAR(enc.Fecha) AS anio,
        MONTH(enc.Fecha) AS mes,
        ROUND(SUM(enc.SubTotal), 0) AS ventas
      FROM [PRODIN].[softland].[iw_gsaen] enc
      WHERE enc.Tipo IN ('F', 'N', 'D')
        AND enc.Estado <> 'A'
        AND enc.Fecha >= DATEFROMPARTS(@anioDesde, 1, 1)
        AND enc.Fecha < DATEFROMPARTS(@anioHasta + 1, 1, 1)
        AND (
          YEAR(enc.Fecha) <> @anioHasta
          OR MONTH(enc.Fecha) <= @mesLimite
        )
      GROUP BY YEAR(enc.Fecha), MONTH(enc.Fecha)
      ORDER BY anio, mes
    `);

  return result.recordset;
}

async function obtenerCategoriasProducto(anio) {
  const pool = await getSoftlandPool();
  const result = await pool.request()
    .input('anio', sql.Int, anio)
    .query(`
      SELECT
        RTRIM(producto.CtaVentas) AS cuentaCategoria,
        ROUND(SUM(movimiento.TotLinea), 0) AS venta
      FROM [PRODIN].[softland].[iw_gsaen] encabezado
      INNER JOIN [PRODIN].[softland].[iw_gmovi] movimiento
        ON movimiento.NroInt = encabezado.NroInt
       AND movimiento.Tipo = encabezado.Tipo
      LEFT JOIN [PRODIN].[softland].[iw_tprod] producto
        ON LTRIM(RTRIM(producto.CodProd)) = LTRIM(RTRIM(movimiento.CodProd))
      WHERE encabezado.Tipo IN ('F', 'N', 'D')
        AND encabezado.Estado <> 'A'
        AND YEAR(encabezado.Fecha) = @anio
      GROUP BY producto.CtaVentas
      ORDER BY venta DESC
    `);

  const distribucion = await clasificarVentasPorCategoria(result.recordset);
  return { total: distribucion.total, categorias: distribucion.items };
}

async function obtenerDetalleMensualSoftland(anio, mes) {
  const precioListaRealCASE = await buildPrecioListaRealCASE(db, {
    campoFecha: 'encabezado.Fecha',
    campoCodProd: 'movimiento.CodProd',
    campoTotLinea: 'movimiento.TotLinea',
    campoCant: 'movimiento.CantFacturada',
    campoPrecioVta: 'producto.PrecioVta',
    campoCodCan: 'canal.CodCan',
  });

  const pool = await getSoftlandPool();
  const result = await pool.request()
    .input('anio', sql.Int, anio)
    .input('mes', sql.Int, mes)
    .query(`
      SELECT
        RTRIM(encabezado.CodVendedor) AS codigoVendedor,
        RTRIM(COALESCE(vendedor.VenDes, encabezado.CodVendedor)) AS nombreVendedor,
        RTRIM(encabezado.CodAux) AS codigoCliente,
        RTRIM(COALESCE(cliente.NomAux, encabezado.CodAux)) AS cliente,
        RTRIM(movimiento.CodProd) AS codigoProducto,
        RTRIM(COALESCE(producto.DesProd, movimiento.CodProd)) AS producto,
        RTRIM(producto.CtaVentas) AS cuentaCategoria,
        CAST(ISNULL(movimiento.TotLinea, 0) AS FLOAT) AS venta,
        CAST(
          ISNULL(movimiento.CantFacturada, 0) * (${precioListaRealCASE})
          AS FLOAT
        ) AS ventaReal
      INTO #DetalleComercial
      FROM [PRODIN].[softland].[iw_gsaen] encabezado
      INNER JOIN [PRODIN].[softland].[iw_gmovi] movimiento
        ON movimiento.NroInt = encabezado.NroInt
       AND movimiento.Tipo = encabezado.Tipo
      LEFT JOIN [PRODIN].[softland].[iw_tprod] producto
        ON LTRIM(RTRIM(producto.CodProd)) = LTRIM(RTRIM(movimiento.CodProd))
      LEFT JOIN [PRODIN].[softland].[cwtauxi] cliente
        ON cliente.CodAux = encabezado.CodAux
      LEFT JOIN [PRODIN].[softland].[cwtvend] vendedor
        ON vendedor.VenCod = encabezado.CodVendedor
      LEFT JOIN [PRODIN].[softland].[cwtcvcl] canal
        ON canal.CodAux = encabezado.CodAux
      WHERE encabezado.Tipo IN ('F', 'N', 'D')
        AND encabezado.Estado <> 'A'
        AND YEAR(encabezado.Fecha) = @anio
        AND MONTH(encabezado.Fecha) = @mes;

      SELECT cuentaCategoria, ROUND(SUM(venta), 0) AS venta
      FROM #DetalleComercial
      GROUP BY cuentaCategoria
      ORDER BY venta DESC;

      SELECT
        codigoCliente,
        MIN(cliente) AS cliente,
        ROUND(SUM(venta), 0) AS venta
      FROM #DetalleComercial
      GROUP BY codigoCliente
      ORDER BY venta DESC;

      SELECT
        codigoProducto,
        MIN(producto) AS producto,
        MIN(cuentaCategoria) AS cuentaCategoria,
        ROUND(SUM(venta), 0) AS venta
      FROM #DetalleComercial
      GROUP BY codigoProducto
      ORDER BY venta DESC;

      SELECT
        codigoVendedor,
        MIN(nombreVendedor) AS nombreVendedor,
        ROUND(SUM(venta), 0) AS venta,
        ROUND(SUM(ventaReal), 0) AS ventaReal
      FROM #DetalleComercial
      GROUP BY codigoVendedor
      ORDER BY venta DESC;
    `);

  const [categoriasRows = [], clientesRows = [], productosRows = [], vendedoresRows = []] = result.recordsets || [];
  const cuentas = [
    ...categoriasRows.map(fila => fila.cuentaCategoria),
    ...productosRows.map(fila => fila.cuentaCategoria),
  ];
  const mapaCategorias = await obtenerCategoriasPorCuenta(cuentas);
  const categorias = await clasificarVentasPorCategoria(categoriasRows, mapaCategorias);
  const clientes = normalizarDistribucion(clientesRows, 'cliente');
  const productos = normalizarDistribucion(productosRows.map(({
    cuentaCategoria,
    ...fila
  }) => ({
    ...fila,
    categoria: mapaCategorias.get(String(cuentaCategoria || '').trim()) || 'Sin categoría',
  })), 'producto');

  return {
    total: categorias.total,
    categorias: categorias.items,
    clientes: clientes.items.slice(0, 10),
    productos: productos.items.slice(0, 10),
    vendedores: vendedoresRows.map(fila => ({
      codigoVendedor: String(fila.codigoVendedor || '').trim(),
      nombreVendedor: String(fila.nombreVendedor || '').trim(),
      venta: Math.round(Number(fila.venta || 0)),
      ventaReal: Math.round(Number(fila.ventaReal || 0)),
    })),
  };
}

function codigoComparable(valor) {
  const codigo = String(valor || '').trim();
  const sinCeros = codigo.replace(/^0+(?=\d)/, '');
  return sinCeros || codigo;
}

async function obtenerRelacionesVendedores() {
  const [rows] = await db.query(`
    SELECT
      usuario.id AS usuarioId,
      usuario.codigo AS codigoPrincipal,
      usuario.nombre AS vendedor,
      usuario_vendedor.cod_vendedor AS codigoAsociado,
      usuario_vendedor.tipo
    FROM usuario
    INNER JOIN usuario_vendedor
      ON usuario_vendedor.usuario_id = usuario.id
    WHERE usuario.is_active = 1
    ORDER BY usuario.nombre, usuario_vendedor.tipo, usuario_vendedor.cod_vendedor
  `);
  return rows;
}

async function obtenerMetasVendedores(anio, usuariosIds) {
  const ids = [...new Set(usuariosIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return { disponible: true, valores: new Map() };
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await db.query(`
      SELECT
        usuario_id AS usuarioId,
        COALESCE(MAX(meta), 0) AS metaMensual
      FROM vendedor_meta
      WHERE activo = 1
        AND YEAR(fecha) = ?
        AND usuario_id IN (${placeholders})
      GROUP BY usuario_id
    `, [anio, ...ids]);

    return {
      disponible: true,
      valores: new Map(rows.map(fila => [
        Number(fila.usuarioId),
        Number(fila.metaMensual || 0),
      ])),
    };
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || /vendedor_meta/i.test(error.message)) {
      console.warn('[gerencia] La tabla vendedor_meta no está disponible en MySQL.');
      return { disponible: false, valores: new Map() };
    }
    throw error;
  }
}

async function consolidarVendedores(vendedoresSoftland, anio) {
  const relaciones = await obtenerRelacionesVendedores();
  const resultadoMetas = await obtenerMetasVendedores(
    anio,
    relaciones.map(relacion => relacion.usuarioId)
  );
  const metas = resultadoMetas.valores;
  const porCodigo = new Map();
  const grupos = new Map();

  relaciones.forEach(relacion => {
    const codigoAsociado = String(relacion.codigoAsociado || '').trim();
    const codigoPrincipal = String(relacion.codigoPrincipal || codigoAsociado).trim();
    const clave = `usuario:${relacion.usuarioId}`;
    porCodigo.set(codigoAsociado, { ...relacion, codigoPrincipal, clave });
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        usuarioId: Number(relacion.usuarioId),
        codigoPrincipal,
        vendedor: String(relacion.vendedor || codigoPrincipal).trim(),
        venta: 0,
        ventaReal: 0,
        codigos: [],
      });
    }
    grupos.get(clave).codigos.push({
      codigo: codigoAsociado,
      nombreAsociado: String(relacion.vendedor || codigoAsociado).trim(),
      venta: 0,
      ventaReal: 0,
      meta: 0,
      esPrincipal: codigoComparable(codigoAsociado) === codigoComparable(codigoPrincipal)
        || ['principal', 'comun', 'común'].includes(normalizarArea(relacion.tipo)),
    });
  });

  vendedoresSoftland.forEach(fila => {
    const codigo = String(fila.codigoVendedor || '').trim();
    const relacion = porCodigo.get(codigo);
    const clave = relacion?.clave || `codigo:${codigo}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        usuarioId: null,
        codigoPrincipal: codigo,
        vendedor: fila.nombreVendedor || codigo,
        venta: 0,
        ventaReal: 0,
        codigos: [],
      });
    }
    const grupo = grupos.get(clave);
    let detalle = grupo.codigos.find(item => item.codigo === codigo);
    if (!detalle) {
      detalle = {
        codigo,
        nombreAsociado: fila.nombreVendedor || codigo,
        venta: 0,
        ventaReal: 0,
        meta: 0,
        esPrincipal: codigoComparable(codigo) === codigoComparable(grupo.codigoPrincipal),
      };
      grupo.codigos.push(detalle);
    }
    detalle.nombreAsociado = fila.nombreVendedor || detalle.nombreAsociado;
    detalle.venta += Number(fila.venta || 0);
    detalle.ventaReal += Number(fila.ventaReal || 0);
    grupo.venta += Number(fila.venta || 0);
    grupo.ventaReal += Number(fila.ventaReal || 0);
  });

  const vendedores = Array.from(grupos.values()).map(grupo => {
    const meta = grupo.usuarioId ? Number(metas.get(grupo.usuarioId) || 0) : 0;
    const principalComparable = codigoComparable(grupo.codigoPrincipal);
    let metaAsignada = false;
    grupo.codigos.forEach(codigo => {
      const esPrincipal = codigo.esPrincipal
        || codigoComparable(codigo.codigo) === principalComparable;
      codigo.meta = !metaAsignada && esPrincipal ? meta : 0;
      if (codigo.meta) metaAsignada = true;
      codigo.porcentajeDescuento = porcentajeDescuento(codigo.venta, codigo.ventaReal);
      codigo.cumplimiento = codigo.meta > 0
        ? Math.round((codigo.venta / codigo.meta) * 10000) / 100
        : null;
    });
    if (!metaAsignada && meta > 0 && grupo.codigoPrincipal) {
      grupo.codigos.push({
        codigo: grupo.codigoPrincipal,
        nombreAsociado: grupo.vendedor,
        venta: 0,
        ventaReal: 0,
        meta,
        esPrincipal: true,
        porcentajeDescuento: null,
        cumplimiento: 0,
      });
      metaAsignada = true;
    }
    grupo.codigos.forEach(codigo => {
      if (codigo.meta > 0 && codigo.cumplimiento === null) {
        codigo.cumplimiento = Math.round((codigo.venta / codigo.meta) * 10000) / 100;
      }
    });
    grupo.codigos.sort((a, b) => b.venta - a.venta);
    return {
      codigoPrincipal: grupo.codigoPrincipal,
      vendedor: grupo.vendedor,
      venta: Math.round(grupo.venta),
      ventaReal: Math.round(grupo.ventaReal),
      porcentajeDescuento: porcentajeDescuento(grupo.venta, grupo.ventaReal),
      meta,
      cumplimiento: meta > 0 ? Math.round((grupo.venta / meta) * 10000) / 100 : null,
      cantidadCodigos: grupo.codigos.length,
      codigos: grupo.codigos.map(codigo => ({
        codigo: codigo.codigo,
        nombreAsociado: codigo.nombreAsociado,
        venta: codigo.venta,
        ventaReal: codigo.ventaReal,
        meta: codigo.meta,
        porcentajeDescuento: codigo.porcentajeDescuento,
        cumplimiento: codigo.cumplimiento,
      })),
    };
  }).filter(grupo => grupo.venta !== 0 || grupo.meta > 0)
    .sort((a, b) => {
      if (a.cumplimiento === null && b.cumplimiento !== null) return 1;
      if (a.cumplimiento !== null && b.cumplimiento === null) return -1;
      return Number(b.cumplimiento || 0) - Number(a.cumplimiento || 0)
        || b.venta - a.venta;
    });
  return { items: vendedores, metaDisponible: resultadoMetas.disponible };
}

function consolidarEstadisticasVentas(ventasRows, gruposRows, relaciones) {
  const candidatasPorCodigo = new Map();
  const relacionesPorCodigo = new Map();
  const relacionesPorUsuario = new Map();
  const gruposPorCodigo = new Map();
  const descripcionPorCodigo = new Map();

  (relaciones || []).forEach(relacion => {
    const codigo = String(relacion.codigoAsociado || '').trim();
    const usuarioId = Number(relacion.usuarioId);
    if (!codigo) return;
    if (!candidatasPorCodigo.has(codigo)) candidatasPorCodigo.set(codigo, []);
    candidatasPorCodigo.get(codigo).push(relacion);
    if (!relacionesPorUsuario.has(usuarioId)) relacionesPorUsuario.set(usuarioId, []);
    relacionesPorUsuario.get(usuarioId).push(relacion);
  });
  candidatasPorCodigo.forEach((candidatas, codigo) => {
    if (candidatas.length === 1) relacionesPorCodigo.set(codigo, candidatas[0]);
  });

  (gruposRows || []).forEach(fila => {
    const codigo = String(fila.codigoVendedor || '').trim();
    const grupo = String(fila.grupo || '').trim();
    const descripcion = String(fila.descripcion || '').trim();
    if (!codigo) return;
    if (!gruposPorCodigo.has(codigo)) gruposPorCodigo.set(codigo, new Set());
    if (grupo) gruposPorCodigo.get(codigo).add(grupo);
    if (descripcion && !descripcionPorCodigo.has(codigo)) {
      descripcionPorCodigo.set(codigo, descripcion);
    }
  });

  function grupoDirectoDeCodigo(codigo) {
    const grupos = Array.from(gruposPorCodigo.get(codigo) || []);
    return grupos.length === 1 ? grupos[0] : 'Sin grupo de negocio';
  }

  const grupoPorUsuario = new Map();
  relacionesPorUsuario.forEach((relacionesUsuario, usuarioId) => {
    const codigoPrincipal = String(relacionesUsuario[0]?.codigoPrincipal || '').trim();
    const relacionPrincipal = relacionesUsuario.find(relacion => (
      codigoComparable(relacion.codigoAsociado) === codigoComparable(codigoPrincipal)
    ));
    const grupoPrincipal = relacionPrincipal
      ? grupoDirectoDeCodigo(String(relacionPrincipal.codigoAsociado || '').trim())
      : 'Sin grupo de negocio';

    if (grupoPrincipal !== 'Sin grupo de negocio') {
      grupoPorUsuario.set(usuarioId, grupoPrincipal);
      return;
    }

    const gruposAsociados = new Set(relacionesUsuario.map(relacion => (
      grupoDirectoDeCodigo(String(relacion.codigoAsociado || '').trim())
    )).filter(grupo => grupo !== 'Sin grupo de negocio'));
    grupoPorUsuario.set(
      usuarioId,
      gruposAsociados.size === 1 ? Array.from(gruposAsociados)[0] : 'Sin grupo de negocio'
    );
  });

  const grupos = new Map();

  function asegurarDetalle(codigo, neto = 0, descripcionVenta = '') {
    const relacion = relacionesPorCodigo.get(codigo);
    const grupoNombre = relacion
      ? grupoPorUsuario.get(Number(relacion.usuarioId)) || 'Sin grupo de negocio'
      : GRUPO_CODIGOS_SIN_ASOCIACION;
    const claveVendedor = relacion
      ? `usuario:${relacion.usuarioId}`
      : `codigo:${codigo}`;
    const codigoPrincipal = String(relacion?.codigoPrincipal || codigo).trim();
    const vendedorNombre = String(
      relacion?.vendedor
      || descripcionVenta
      || descripcionPorCodigo.get(codigo)
      || codigoPrincipal
    ).trim();

    if (!grupos.has(grupoNombre)) {
      grupos.set(grupoNombre, {
        grupo: grupoNombre,
        total: 0,
        vendedores: new Map(),
      });
    }
    const grupo = grupos.get(grupoNombre);
    if (!grupo.vendedores.has(claveVendedor)) {
      grupo.vendedores.set(claveVendedor, {
        codigoPrincipal,
        vendedor: vendedorNombre,
        neto: 0,
        codigos: new Map(),
      });
    }
    const vendedor = grupo.vendedores.get(claveVendedor);
    if (!vendedor.codigos.has(codigo)) {
      vendedor.codigos.set(codigo, {
        codigo,
        descripcion: descripcionVenta || descripcionPorCodigo.get(codigo) || vendedorNombre,
        grupo: grupoNombre,
        neto: 0,
      });
    }

    const detalle = vendedor.codigos.get(codigo);
    detalle.descripcion = descripcionVenta || detalle.descripcion;
    detalle.neto += Number(neto || 0);
    vendedor.neto += Number(neto || 0);
    grupo.total += Number(neto || 0);
  }

  (relaciones || []).forEach(relacion => {
    const codigo = String(relacion.codigoAsociado || '').trim();
    if (codigo && relacionesPorCodigo.get(codigo) === relacion) asegurarDetalle(codigo);
  });

  (ventasRows || []).forEach(fila => {
    const codigo = String(fila.codigoVendedor || '').trim();
    if (!codigo) return;
    asegurarDetalle(
      codigo,
      Number(fila.neto || 0),
      String(fila.descripcion || '').trim()
    );
  });

  const items = Array.from(grupos.values()).map(grupo => {
    const vendedores = Array.from(grupo.vendedores.values())
      .filter(vendedor => vendedor.neto !== 0)
      .map(vendedor => {
        const neto = Math.round(vendedor.neto);
        const codigos = Array.from(vendedor.codigos.values())
          .map(codigo => ({
            ...codigo,
            neto: Math.round(codigo.neto),
            participacion: participacion(codigo.neto, vendedor.neto),
          }))
          .sort((a, b) => b.neto - a.neto || a.codigo.localeCompare(b.codigo, 'es'));
        return {
          codigoPrincipal: vendedor.codigoPrincipal,
          vendedor: vendedor.vendedor,
          neto,
          participacion: participacion(vendedor.neto, grupo.total),
          cantidadCodigos: codigos.length,
          codigos,
        };
      })
      .sort((a, b) => b.neto - a.neto || a.vendedor.localeCompare(b.vendedor, 'es'));

    return {
      grupo: grupo.grupo,
      total: Math.round(grupo.total),
      vendedores,
    };
  }).filter(grupo => grupo.vendedores.length)
    .sort((a, b) => a.grupo.localeCompare(b.grupo, 'es'));

  const codigosUnicos = new Set();
  let cantidadVendedores = 0;
  items.forEach(grupo => {
    cantidadVendedores += grupo.vendedores.length;
    grupo.vendedores.forEach(vendedor => {
      vendedor.codigos.forEach(codigo => codigosUnicos.add(codigo.codigo));
    });
  });

  return {
    total: items.reduce((total, grupo) => total + grupo.total, 0),
    cantidadUnidades: items.length,
    cantidadVendedores,
    cantidadCodigos: codigosUnicos.size,
    grupos: items,
  };
}

async function obtenerEstadisticasVentas(anio, mes) {
  const fechaDesde = new Date(anio, mes - 1, 1);
  const fechaHasta = new Date(anio, mes, 1);
  const pool = await getSoftlandPool();
  const result = await pool.request()
    .input('fechaDesde', sql.Date, fechaDesde)
    .input('fechaHasta', sql.Date, fechaHasta)
    .query(`
      ;WITH VentasPorCodigo AS (
        SELECT
          RTRIM(encabezado.CodVendedor) AS codigoVendedor,
          ROUND(SUM(movimiento.TotLinea), 0) AS neto
        FROM [PRODIN].[softland].[iw_gsaen] encabezado
        INNER JOIN [PRODIN].[softland].[iw_gmovi] movimiento
          ON movimiento.NroInt = encabezado.NroInt
         AND movimiento.Tipo = encabezado.Tipo
        WHERE encabezado.Fecha >= @fechaDesde
          AND encabezado.Fecha < @fechaHasta
          AND encabezado.Tipo IN ('F', 'N', 'D')
          AND encabezado.Estado <> 'A'
        GROUP BY encabezado.CodVendedor
      )
      SELECT
        ventas.codigoVendedor,
        COALESCE(descripcion.descripcion, ventas.codigoVendedor) AS descripcion,
        ventas.neto
      FROM VentasPorCodigo ventas
      OUTER APPLY (
        SELECT TOP (1) RTRIM(vendedor.VenDes) AS descripcion
        FROM [PRODIN].[softland].[cwtvend] vendedor
        WHERE LTRIM(RTRIM(vendedor.VenCod)) = LTRIM(RTRIM(ventas.codigoVendedor))
      ) descripcion
      ORDER BY neto DESC;

      WITH VendedorGrupo AS (
        SELECT
          RTRIM(vendedor.VenCod) AS codigoVendedor,
          RTRIM(vendedor.VenDes) AS descripcion,
          RTRIM(grupo.DesGrupo) AS grupo,
          ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(vendedor.VenCod))
            ORDER BY
              CASE WHEN ISNULL(usuarioSoftland.Bloqueado, 0) = 0 THEN 0 ELSE 1 END,
              CASE WHEN ISNULL(usuarioSoftland.Bloqueado2, 0) = 0 THEN 0 ELSE 1 END,
              CASE
                WHEN usuarioSoftland.fechalogin IS NULL
                  OR usuarioSoftland.fechalogin <= CONVERT(datetime, '17530102', 112)
                THEN 1 ELSE 0
              END,
              usuarioSoftland.fechalogin DESC
          ) AS prioridad
        FROM [PRODIN].[softland].[ECGrupoT] grupo
        INNER JOIN [PRODIN].[softland].[WISusuarios] usuarioSoftland
          ON LTRIM(RTRIM(usuarioSoftland.CodGrTrab)) = LTRIM(RTRIM(grupo.CodGrupo))
        INNER JOIN [PRODIN].[softland].[cwtvend] vendedor
          ON LTRIM(RTRIM(vendedor.Usuario)) = LTRIM(RTRIM(usuarioSoftland.Usuario))
      )
      SELECT codigoVendedor, descripcion, grupo
      FROM VendedorGrupo
      WHERE prioridad = 1
      ORDER BY grupo, codigoVendedor;
    `);

  const [ventasRows = [], gruposRows = []] = result.recordsets || [];
  const relaciones = await obtenerRelacionesVendedores();
  return consolidarEstadisticasVentas(ventasRows, gruposRows, relaciones);
}

async function obtenerMontosDescuento(anio, mesLimite, mesExacto = null) {
  const precioListaRealCASE = await buildPrecioListaRealCASE(db, {
    campoFecha: 'enc.Fecha',
    campoCodProd: 'm.CodProd',
    campoTotLinea: 'm.TotLinea',
    campoCant: 'm.CantFacturada',
    campoPrecioVta: 't.PrecioVta',
    campoCodCan: 'cvl.CodCan',
  });

  const pool = await getSoftlandPool();
  const request = pool.request()
    .input('anio', sql.Int, anio)
    .input('mesLimite', sql.Int, mesLimite);

  const filtroMes = mesExacto === null
    ? 'AND MONTH(enc.Fecha) <= @mesLimite'
    : 'AND MONTH(enc.Fecha) = @mes';

  if (mesExacto !== null) request.input('mes', sql.Int, mesExacto);

  const result = await request.query(`
    SELECT
      ROUND(SUM(m.TotLinea), 0) AS MontoVenta,
      ROUND(SUM(m.CantFacturada * (${precioListaRealCASE})), 0) AS MontoReal
    FROM [PRODIN].[softland].[iw_gsaen] enc
    INNER JOIN [PRODIN].[softland].[iw_gmovi] m
      ON m.NroInt = enc.NroInt AND m.Tipo = enc.Tipo
    INNER JOIN [PRODIN].[softland].[iw_tprod] t
      ON t.CodProd = m.CodProd
    LEFT JOIN [PRODIN].[softland].[cwtcvcl] cvl
      ON cvl.CodAux = enc.CodAux
    WHERE enc.Tipo IN ('F', 'N', 'D')
      AND enc.Estado <> 'A'
      AND YEAR(enc.Fecha) = @anio
      ${filtroMes}
  `);

  const fila = result.recordset[0] || {};
  const montoVenta = Number(fila.MontoVenta || 0);
  const montoReal = Number(fila.MontoReal || 0);
  return {
    montoVenta,
    montoReal,
    porcentajeDescuento: porcentajeDescuento(montoVenta, montoReal),
  };
}

router.use(requireAuth, requireGerenciaOrAdmin);

router.get('/comercial/resumen', async (req, res) => {
  let anio;
  try {
    anio = validarAnio(req.query.anio);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  try {
    const hoy = new Date();
    const mesLimite = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
    const periodos = [anio - 2, anio - 1, anio];
    const [ventasRows, descuento, categoriasAnuales] = await Promise.all([
      obtenerVentasComparativas(anio, mesLimite),
      obtenerMontosDescuento(anio, mesLimite),
      obtenerCategoriasProducto(anio),
    ]);

    const porPeriodo = new Map(periodos.map(periodo => [periodo, new Map()]));
    ventasRows.forEach(fila => {
      const periodo = Number(fila.anio);
      if (porPeriodo.has(periodo)) {
        porPeriodo.get(periodo).set(Number(fila.mes), Number(fila.ventas || 0));
      }
    });

    const mesesCompletos = Array.from({ length: 12 }, (_, indice) => indice + 1);
    const comparativoMensual = mesesCompletos.map((mes) => {
      const valores = periodos.map(periodo => porPeriodo.get(periodo).get(mes) || 0);
      return {
        mes,
        valores,
        variaciones: [null, variacion(valores[1], valores[0]), variacion(valores[2], valores[1])],
      };
    });

    const totalesValores = periodos.map((periodo) => (
      Array.from(porPeriodo.get(periodo).values()).reduce((total, valor) => total + valor, 0)
    ));
    const totales = {
      valores: totalesValores,
      variaciones: [
        null,
        variacion(totalesValores[1], totalesValores[0]),
        variacion(totalesValores[2], totalesValores[1]),
      ],
    };
    const ventasAcumuladas = totalesValores[2];

    return res.json({
      ok: true,
      data: {
        anioSeleccionado: anio,
        mesLimite,
        resumen: {
          ventasAcumuladas,
          montoReal: descuento.montoReal,
          porcentajeDescuento: descuento.porcentajeDescuento,
          promedioMensual: Math.round(ventasAcumuladas / mesLimite),
        },
        periodos,
        comparativoMensual,
        totales,
        categorias: categoriasAnuales.categorias,
        totalCategorias: categoriasAnuales.total,
      },
    });
  } catch (error) {
    console.error('[GET /api/gerencia/comercial/resumen]', error.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener el resumen comercial.' });
  }
});

router.get('/comercial/mensual', async (req, res) => {
  let anio;
  let mes;
  try {
    anio = validarAnio(req.query.anio);
    mes = validarMes(req.query.mes);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  try {
    const [descuento, detalleMensual] = await Promise.all([
      obtenerMontosDescuento(anio, mes, mes),
      obtenerDetalleMensualSoftland(anio, mes),
    ]);
    const resultadoVendedores = await consolidarVendedores(detalleMensual.vendedores, anio);
    const vendedores = resultadoVendedores.items;
    const totalMensual = descuento.montoVenta;
    const metaMensual = resultadoVendedores.metaDisponible
      ? vendedores.reduce((total, vendedor) => total + Number(vendedor.meta || 0), 0)
      : null;
    const cumplimiento = metaMensual !== null && metaMensual !== 0
      ? Math.round((descuento.montoVenta / metaMensual) * 10000) / 100
      : null;

    return res.json({
      ok: true,
      data: {
        anio,
        mes,
        ventaMes: descuento.montoVenta,
        meta: metaMensual,
        metaMes: metaMensual,
        cumplimiento,
        montoReal: descuento.montoReal,
        porcentajeDescuento: descuento.porcentajeDescuento,
        metaDisponible: resultadoVendedores.metaDisponible,
        totalCategorias: totalMensual,
        categorias: aplicarTotalDistribucion(detalleMensual.categorias, totalMensual),
        clientes: aplicarTotalDistribucion(detalleMensual.clientes, totalMensual),
        productos: aplicarTotalDistribucion(detalleMensual.productos, totalMensual),
        vendedores,
      },
    });
  } catch (error) {
    console.error('[GET /api/gerencia/comercial/mensual]', error.message);
    return res.status(500).json({ ok: false, error: 'Error al obtener los indicadores mensuales.' });
  }
});

router.get('/comercial/estadisticas-ventas', async (req, res) => {
  let anio;
  let mes;
  try {
    anio = validarAnio(req.query.anio);
    mes = validarMes(req.query.mes);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  try {
    const estadisticas = await obtenerEstadisticasVentas(anio, mes);
    return res.json({
      ok: true,
      data: {
        mes,
        anio,
        total: estadisticas.total,
        resumen: {
          ventaTotal: estadisticas.total,
          cantidadUnidades: estadisticas.cantidadUnidades,
          cantidadVendedores: estadisticas.cantidadVendedores,
          cantidadCodigos: estadisticas.cantidadCodigos,
        },
        grupos: estadisticas.grupos,
      },
    });
  } catch (error) {
    console.error('[GET /api/gerencia/comercial/estadisticas-ventas]', error.message);
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener las estadísticas de ventas.',
    });
  }
});

router._helpers = {
  porcentajeDescuento,
  variacion,
  validarAnio,
  validarMes,
  consolidarEstadisticasVentas,
};

module.exports = router;
