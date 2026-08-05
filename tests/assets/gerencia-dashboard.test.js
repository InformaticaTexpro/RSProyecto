/**
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(
  path.join(__dirname, '../../src/modulo/gerencia/dashboard-comercial/index.html'),
  'utf8'
);
const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../../src/modulo/gerencia/assets/gerencia-dashboard.js'),
  'utf8'
);

function respuesta(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

async function esperarRender() {
  for (let intento = 0; intento < 20; intento += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (document.querySelectorAll('#tablaVendedoresBody tr').length > 0
      && !document.querySelector('#tablaVendedoresBody .gerencia-empty')) return;
  }
}

describe('Dashboard Comercial ampliado', () => {
  let instanciasChart;

  beforeEach(() => {
    document.documentElement.innerHTML = HTML;
    localStorage.clear();
    localStorage.setItem('token', 'token-prueba');
    instanciasChart = [];
    window.Chart = function Chart(_canvas, config) {
      this.config = config;
      this.destroy = jest.fn();
      instanciasChart.push(this);
    };

    global.fetch = jest.fn((url) => {
      if (url === '/api/auth/me') {
        return respuesta({ ok: true, user: { nombre: 'Gerencia QA', area: 'Gerencia' } });
      }
      if (String(url).includes('/resumen?')) {
        return respuesta({
          ok: true,
          data: {
            anioSeleccionado: 2026,
            mesLimite: 7,
            resumen: { ventasAcumuladas: 300, porcentajeDescuento: 10, promedioMensual: 43 },
            periodos: [2024, 2025, 2026],
            comparativoMensual: Array.from({ length: 12 }, (_, indice) => ({
              mes: indice + 1,
              valores: [100, 200, indice < 7 ? 300 : 0],
              variaciones: [null, 100, indice < 7 ? 50 : -100],
            })),
            totales: { valores: [1200, 2400, 2100], variaciones: [null, 100, -12.5] },
            categorias: [{ categoria: 'Textil', venta: 300, participacion: 100 }],
            totalCategorias: 300,
          },
        });
      }
      return respuesta({
        ok: true,
        data: {
          anio: 2026,
          mes: 7,
          ventaMes: 300,
          meta: 250,
          cumplimiento: 120,
          porcentajeDescuento: 10,
          metaDisponible: true,
          categorias: [{ categoria: 'Textil', venta: 300, participacion: 100 }],
          totalCategorias: 300,
          clientes: [{ codigoCliente: 'C1', cliente: 'Cliente Uno', venta: 300, participacion: 100 }],
          productos: [{ codigoProducto: 'P1', producto: 'Producto Uno', categoria: 'Textil', venta: 300, participacion: 100 }],
          vendedores: [{
            codigoPrincipal: '001',
            vendedor: 'Vendedor Uno',
            venta: 300,
            ventaReal: 330,
            porcentajeDescuento: 9.09,
            meta: 250,
            cumplimiento: 120,
            cantidadCodigos: 2,
            codigos: [
              { codigo: '001', nombreAsociado: 'Principal', venta: 200, ventaReal: 220, porcentajeDescuento: 9.09, meta: 250, cumplimiento: 80 },
              { codigo: '5001', nombreAsociado: 'Asociado', venta: 100, ventaReal: 110, porcentajeDescuento: 9.09, meta: 0, cumplimiento: null },
            ],
          }],
        },
      });
    });
  });

  test('renderiza líneas, tops, vendedores y modal coordinados', async () => {
    eval(SCRIPT);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await esperarRender();

    const linea = instanciasChart.find(chart => chart.config.type === 'line');
    const donas = instanciasChart.filter(chart => chart.config.type === 'doughnut');
    expect(linea.config.data.datasets.every(serie => serie.data.length === 12)).toBe(true);
    expect(donas).toHaveLength(2);
    expect(document.getElementById('tablaLineasAnualBody').textContent).toContain('Textil');
    expect(document.getElementById('tablaLineasMensualBody').textContent).toContain('Textil');
    expect(document.getElementById('tablaTopClientesBody').textContent).toContain('Cliente Uno');
    expect(document.getElementById('tablaTopProductosBody').textContent).toContain('Producto Uno');
    expect(document.getElementById('tablaVendedoresBody').textContent).toContain('Vendedor Uno');

    document.querySelector('.gerencia-vendedor-btn').click();
    const overlay = document.getElementById('modalVendedorOverlay');
    expect(overlay.classList.contains('modal-overlay--visible')).toBe(true);
    expect(document.querySelectorAll('#modalVendedorBody tr')).toHaveLength(2);
    expect(document.getElementById('modalVendedorFoot').textContent).toContain('$300');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay.classList.contains('modal-overlay--visible')).toBe(false);

    const llamadasMensualesAntes = global.fetch.mock.calls
      .filter(([url]) => String(url).includes('/mensual?')).length;
    document.getElementById('btnActualizarAnual').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const llamadasMensualesDespues = global.fetch.mock.calls
      .filter(([url]) => String(url).includes('/mensual?')).length;
    expect(llamadasMensualesDespues).toBe(llamadasMensualesAntes);
    expect(document.getElementById('tablaVendedoresBody').textContent).toContain('Sin vendedores');
  });
});
