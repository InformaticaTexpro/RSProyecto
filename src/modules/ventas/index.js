'use strict';
/**
 * modules/ventas/index.js
 *
 * Punto de entrada del módulo de ventas.
 * Redirige al router existente en src/routes/ventas.js
 * sin modificar su lógica interna.
 *
 * Endpoints expuestos bajo /api/ventas:
 *   GET /api/ventas
 *   GET /api/ventas/kpis
 *   GET /api/ventas/total
 *   GET /api/ventas/resumen
 *   GET /api/ventas/resumen-vendedores
 *   GET /api/ventas/evolucion
 *   GET /api/ventas/meta
 *   GET /api/ventas/clientes
 *   GET /api/ventas/folio/:folio
 *   GET /api/ventas/detalle/:folio
 *   GET /api/ventas/descuentos
 */

module.exports = require('../../routes/ventas');
