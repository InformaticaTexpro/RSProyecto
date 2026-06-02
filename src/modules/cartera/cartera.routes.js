'use strict';

/**
 * modules/cartera/cartera.routes.js
 *
 * Migrado desde: src/routes/cartera.js
 */

const express             = require('express');
const router              = express.Router();
const { requireAuth }     = require('../../middlewares/requireAuth');
const db                  = require('../../config/db');
const { getSoftlandPool } = require('../../config/db.softland');
const { validarMesAnio }  = require('../../utils/stringHelpers');

router.use(requireAuth);

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

async function getCodigosVendedor(usuarioId) {
  const [rows] = await db.pool.query(
    `SELECT cod_vendedor FROM usuario_vendedor WHERE usuario_id = ?`,
    [usuarioId]
  );
  return rows.map(r => r.cod_vendedor).filter(Boolean);
}

// GET /api/cartera
router.get('/', async (req, res) => {
  const usuario = req.usuario;
  const hoy = new Date();
  let mes, anio;
  try {
    ({ mes, anio } = validarMesAnio(
      req.query.mes  ?? (hoy.getMonth() + 1),
      req.query.anio ?? hoy.getFullYear()
    ));
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  try {
    const codigos = await getCodigosVendedor(usuario.sub);
    if (!codigos.length) {
      return res.json({ ok: true, activos: [], inactivos: [], recuperados: [], sinCompras: [] });
    }
    const pool = await getSoftlandPool();
    const inClause = mssqlIn(codigos);

    const resActivos = await pool.request().query(`
      SELECT h.CodAux, MAX(RTRIM(c.NomAux)) AS NomAux,
        MAX(RTRIM(c.FONAUX1)) AS FONAUX1, MAX(RTRIM(c.FonAux2)) AS FonAux2,
        MAX(RTRIM(c.EMail)) AS EMail,
        COUNT(DISTINCT h.Folio) AS TotalCompras, MAX(h.Fecha) AS UltimaFactura
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.CodVendedor IN (${inClause}) AND h.Tipo IN ('F','N','D') AND h.Estado <> 'A'
        AND h.Fecha >= DATEFROMPARTS(${anio}, ${mes}, 1)
        AND h.Fecha <  DATEADD(MONTH, 1, DATEFROMPARTS(${anio}, ${mes}, 1))
      GROUP BY h.CodAux ORDER BY MAX(h.Fecha) DESC
    `);

    const resInactivos = await pool.request().query(`
      SELECT h.CodAux, MAX(RTRIM(c.NomAux)) AS NomAux,
        MAX(RTRIM(c.FONAUX1)) AS FONAUX1, MAX(RTRIM(c.FonAux2)) AS FonAux2,
        MAX(RTRIM(c.EMail)) AS EMail,
        COUNT(DISTINCT h.Folio) AS TotalCompras,
        DATEDIFF(DAY, MAX(h.Fecha), GETDATE()) AS DiasInactivo
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.CodVendedor IN (${inClause}) AND h.Tipo IN ('F','N','D') AND h.Estado <> 'A'
      GROUP BY h.CodAux
      HAVING MAX(h.Fecha) < DATEADD(DAY, -90, GETDATE())
        AND h.CodAux NOT IN (
          SELECT CodAux FROM [PRODIN].[softland].[iw_gsaen]
          WHERE CodVendedor IN (${inClause}) AND Tipo IN ('F','N','D') AND Estado <> 'A'
            AND Fecha >= DATEFROMPARTS(${anio}, ${mes}, 1)
            AND Fecha <  DATEADD(MONTH, 1, DATEFROMPARTS(${anio}, ${mes}, 1))
        )
      ORDER BY DATEDIFF(DAY, MAX(h.Fecha), GETDATE()) ASC
    `);

    const resRecuperados = await pool.request().query(`
      WITH FoliosOrdenados AS (
        SELECT h.CodAux, h.Folio, h.Fecha,
          ROW_NUMBER() OVER (PARTITION BY h.CodAux ORDER BY h.Fecha DESC, h.Folio DESC) AS RowNum
        FROM [PRODIN].[softland].[iw_gsaen] h
        WHERE h.CodVendedor IN (${inClause}) AND h.Tipo IN ('F','N','D') AND h.Estado <> 'A'
      ),
      UltimoFolio AS (SELECT CodAux, Folio AS UltimoFolio, Fecha AS UltimaFecha FROM FoliosOrdenados WHERE RowNum = 1),
      PenultimoFolio AS (SELECT CodAux, Folio AS PenultimoFolio, Fecha AS PenultimaFecha FROM FoliosOrdenados WHERE RowNum = 2),
      TotalCompras AS (
        SELECT CodAux, COUNT(DISTINCT Folio) AS TotalFolios
        FROM [PRODIN].[softland].[iw_gsaen]
        WHERE CodVendedor IN (${inClause}) AND Tipo IN ('F','N','D') AND Estado <> 'A'
        GROUP BY CodAux
      )
      SELECT cv.CodAux, RTRIM(c.NomAux) AS NomAux, RTRIM(c.FONAUX1) AS FONAUX1,
        RTRIM(c.FonAux2) AS FonAux2, RTRIM(c.EMail) AS EMail,
        tc.TotalFolios AS TotalCompras,
        pf.PenultimoFolio, pf.PenultimaFecha AS PenultimaFactura,
        uf.UltimoFolio, uf.UltimaFecha AS UltimaFactura,
        DATEDIFF(DAY, pf.PenultimaFecha, uf.UltimaFecha) AS DiasRecuperado
      FROM [PRODIN].[softland].[cwtauxven] cv
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = cv.CodAux
      INNER JOIN UltimoFolio uf ON uf.CodAux = cv.CodAux
      INNER JOIN PenultimoFolio pf ON pf.CodAux = cv.CodAux
      LEFT JOIN TotalCompras tc ON tc.CodAux = cv.CodAux
      WHERE cv.VenCod IN (${inClause})
        AND uf.UltimaFecha  >= DATEADD(DAY, -90, GETDATE())
        AND pf.PenultimaFecha < DATEADD(DAY, -90, GETDATE())
      ORDER BY DiasRecuperado DESC
    `);

    const resSinCompras = await pool.request().query(`
      SELECT cv.CodAux, RTRIM(c.NomAux) AS NomAux, RTRIM(c.FONAUX1) AS FONAUX1,
        RTRIM(c.FonAux2) AS FonAux2, RTRIM(c.EMail) AS EMail,
        'Sin compras registradas' AS Estado
      FROM [PRODIN].[softland].[cwtauxven] cv
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = cv.CodAux
      WHERE cv.VenCod IN (${inClause})
        AND NOT EXISTS (
          SELECT 1 FROM [PRODIN].[softland].[iw_gsaen] h
          WHERE h.CodAux = cv.CodAux AND h.Tipo IN ('F','N','D') AND h.Estado <> 'A'
        )
      ORDER BY c.NomAux
    `);

    res.json({
      ok: true,
      activos:     resActivos.recordset,
      inactivos:   resInactivos.recordset,
      recuperados: resRecuperados.recordset,
      sinCompras:  resSinCompras.recordset,
    });
  } catch (err) {
    console.error('[GET /api/cartera]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener cartera' });
  }
});

module.exports = router;
