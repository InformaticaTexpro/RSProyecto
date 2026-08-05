/**
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(
  path.join(
    __dirname,
    '../../src/modulo/gerencia/comercial/estadisticas-ventas/index.html'
  ),
  'utf8'
);
const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../../src/modulo/gerencia/assets/estadisticas-ventas.js'),
  'utf8'
);
const MESES_PRUEBA = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function respuesta(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

function datosPeriodo(mes, anio) {
  return {
    ok: true,
    data: {
      mes,
      anio,
      total: 200,
      resumen: {
        ventaTotal: 200,
        cantidadUnidades: 1,
        cantidadVendedores: 1,
        cantidadCodigos: 2,
      },
      grupos: [{
        grupo: 'TEXPRO INTERNO',
        total: 200,
        vendedores: [{
          codigoPrincipal: '001',
          vendedor: 'Vendedor Uno',
          neto: 200,
          participacion: 100,
          cantidadCodigos: 2,
          codigos: [
            { codigo: '001', descripcion: 'Principal', grupo: 'TEXPRO INTERNO', neto: 180, participacion: 90 },
            { codigo: '5001', descripcion: 'Asociado', grupo: 'TEXPRO INTERNO', neto: 20, participacion: 10 },
          ],
        }],
      }],
    },
  };
}

async function siguienteCiclo() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('Estadísticas de Ventas', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = HTML;
    localStorage.clear();
    localStorage.setItem('token', 'token-prueba');
  });

  test('carga el período actual, evita duplicados y coordina tabla y modal', async () => {
    let resolverPrimeraCarga;
    const primeraCarga = new Promise(resolve => {
      resolverPrimeraCarga = resolve;
    });
    let solicitudesEstadisticas = 0;
    global.fetch = jest.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(respuesta({
          ok: true,
          user: { nombre: 'Gerencia QA', area: 'Gerencia' },
        }));
      }
      solicitudesEstadisticas += 1;
      if (solicitudesEstadisticas === 1) return primeraCarga;
      const params = new URL(String(url), 'http://localhost').searchParams;
      return Promise.resolve(respuesta(datosPeriodo(
        Number(params.get('mes')),
        Number(params.get('anio'))
      )));
    });

    eval(SCRIPT);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await siguienteCiclo();

    const hoy = new Date();
    expect(document.getElementById('filtroMesEstadisticas').value).toBe(
      String(hoy.getMonth() + 1)
    );
    expect(document.getElementById('filtroAnioEstadisticas').value).toBe(
      String(hoy.getFullYear())
    );
    expect(document.getElementById('btnActualizarEstadisticas').disabled).toBe(true);
    expect(document.getElementById('btnImprimirEstadisticas').disabled).toBe(true);
    expect(document.getElementById('btnExcelEstadisticas').disabled).toBe(true);
    expect(document.getElementById('btnPdfEstadisticas').disabled).toBe(true);

    document.getElementById('btnActualizarEstadisticas').click();
    expect(solicitudesEstadisticas).toBe(1);

    resolverPrimeraCarga(respuesta(datosPeriodo(hoy.getMonth() + 1, hoy.getFullYear())));
    await siguienteCiclo();
    await siguienteCiclo();

    expect(document.getElementById('btnActualizarEstadisticas').disabled).toBe(false);
    expect(document.getElementById('btnImprimirEstadisticas').disabled).toBe(false);
    expect(document.getElementById('btnExcelEstadisticas').disabled).toBe(false);
    expect(document.getElementById('btnPdfEstadisticas').disabled).toBe(false);
    expect(document.getElementById('gruposEstadisticas').textContent).toContain('TEXPRO INTERNO');
    expect(document.getElementById('gruposEstadisticas').textContent).toContain('Vendedor Uno');
    expect(document.getElementById('gruposEstadisticas').textContent).toContain('$200');
    expect(document.getElementById('tituloResumenGeneral').textContent).toContain(
      `${MESES_PRUEBA[hoy.getMonth()]} ${hoy.getFullYear()}`
    );
    expect(document.getElementById('resumenVentaTotal').textContent).toContain('$200');
    expect(document.getElementById('resumenUnidades').textContent).toBe('1');
    expect(document.getElementById('resumenVendedores').textContent).toBe('1');
    expect(document.getElementById('resumenCodigos').textContent).toBe('2');
    expect(document.getElementById('resumenUnidadesBody').textContent).toContain(
      'TEXPRO INTERNO'
    );
    expect(document.getElementById('resumenUnidadesFoot').textContent).toContain('100,0 %');
    expect(document.getElementById('tituloDetalleUnidades').textContent).toBe(
      'Detalle por unidad de negocio'
    );
    expect(document.querySelector('.gerencia-unidad-header').textContent).toContain(
      'TEXPRO INTERNO'
    );
    expect(document.querySelector('.gerencia-total-unidad').textContent).toContain(
      'TOTAL UNIDAD'
    );

    document.querySelector('.estadisticas-vendedor-btn').click();
    const overlay = document.getElementById('modalCodigosOverlay');
    expect(overlay.classList.contains('modal-overlay--visible')).toBe(true);
    expect(document.querySelectorAll('#modalCodigosBody tr')).toHaveLength(2);
    expect(document.getElementById('modalCodigosFoot').textContent).toContain('$200');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay.classList.contains('modal-overlay--visible')).toBe(false);

    document.getElementById('filtroMesEstadisticas').value = '1';
    document.getElementById('filtroAnioEstadisticas').value = '2025';
    document.getElementById('btnActualizarEstadisticas').click();
    await siguienteCiclo();
    expect(String(global.fetch.mock.calls.at(-1)[0])).toContain('mes=1&anio=2025');
  });

  test('limpia resultados anteriores cuando el período no tiene ventas', async () => {
    global.fetch = jest.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(respuesta({
          ok: true,
          user: { nombre: 'Gerencia QA', area: 'Gerencia' },
        }));
      }
      const params = new URL(String(url), 'http://localhost').searchParams;
      return Promise.resolve(respuesta({
        ok: true,
        data: {
          mes: Number(params.get('mes')),
          anio: Number(params.get('anio')),
          total: 0,
          grupos: [],
        },
      }));
    });

    eval(SCRIPT);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await siguienteCiclo();
    await siguienteCiclo();

    expect(document.getElementById('gruposEstadisticas').children).toHaveLength(0);
    expect(document.getElementById('estadoEstadisticas').textContent).toContain(
      'No existen ventas'
    );
    expect(document.getElementById('btnImprimirEstadisticas').disabled).toBe(true);
    expect(document.getElementById('btnExcelEstadisticas').disabled).toBe(true);
    expect(document.getElementById('btnPdfEstadisticas').disabled).toBe(true);
  });

  test('ordena el resumen y exporta el último período aplicado sin consultas adicionales', async () => {
    const datos = datosPeriodo(7, 2026);
    datos.data.total = 300;
    datos.data.resumen.ventaTotal = 300;
    datos.data.resumen.cantidadUnidades = 2;
    datos.data.grupos = [
      {
        grupo: 'UNIDAD MENOR',
        total: 100,
        vendedores: [{
          codigoPrincipal: '002',
          vendedor: 'Vendedor Dos',
          neto: 100,
          participacion: 100,
          cantidadCodigos: 1,
          codigos: [{
            codigo: '002',
            descripcion: 'Secundario',
            grupo: 'UNIDAD MENOR',
            neto: 100,
            participacion: 100,
          }],
        }],
      },
      {
        ...datos.data.grupos[0],
        grupo: 'UNIDAD MAYOR',
        total: 200,
      },
    ];

    global.fetch = jest.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(respuesta({
          ok: true,
          user: { nombre: 'Gerencia QA', area: 'Gerencia' },
        }));
      }
      return Promise.resolve(respuesta(datos));
    });
    window.print = jest.fn();
    const hojas = [];
    window.XLSX = {
      utils: {
        book_new: jest.fn(() => ({})),
        aoa_to_sheet: jest.fn(filas => ({ filas, '!ref': 'A1:F30' })),
        decode_range: jest.fn(() => ({ e: { r: 29 } })),
        encode_cell: jest.fn(({ r, c }) => `${r}:${c}`),
        book_append_sheet: jest.fn((libro, hoja, nombre) => hojas.push({ nombre, hoja })),
      },
      writeFile: jest.fn(),
    };
    const tablasPdf = [];
    const guardarPdf = jest.fn();
    window.jspdf = {
      jsPDF: class {
        constructor() {
          this.lastAutoTable = { finalY: 35 };
        }
        setTextColor() {}
        setFont() {}
        setFontSize() {}
        text() {}
        addPage() {}
        setPage() {}
        getNumberOfPages() { return 1; }
        autoTable(opciones) {
          tablasPdf.push(opciones);
          this.lastAutoTable = { finalY: Number(opciones.startY || 15) + 20 };
        }
        save(nombre) { guardarPdf(nombre); }
      },
    };

    eval(SCRIPT);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await siguienteCiclo();
    await siguienteCiclo();

    const unidades = [...document.querySelectorAll('#resumenUnidadesBody tr')];
    expect(unidades[0].textContent).toContain('UNIDAD MAYOR');
    expect(unidades[1].textContent).toContain('UNIDAD MENOR');
    expect(document.getElementById('resumenUnidadesFoot').textContent).toContain('$300');
    expect(document.getElementById('resumenUnidadesFoot').textContent).toContain('100,0 %');

    const solicitudesAntes = global.fetch.mock.calls.length;
    document.getElementById('filtroMesEstadisticas').value = '8';
    document.getElementById('filtroAnioEstadisticas').value = '2025';
    document.getElementById('btnImprimirEstadisticas').click();
    document.getElementById('btnExcelEstadisticas').click();
    document.getElementById('btnPdfEstadisticas').click();

    expect(global.fetch).toHaveBeenCalledTimes(solicitudesAntes);
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(document.getElementById('periodoImpresion').textContent).toContain('Julio 2026');
    expect(hojas.map(hoja => hoja.nombre)).toEqual([
      'Resumen',
      'Detalle por unidad',
      'Códigos asociados',
    ]);
    expect(hojas[0].hoja.filas).toContainEqual(['Mes', 'Julio']);
    expect(window.XLSX.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      'Estadisticas_Ventas_2026_07.xlsx',
      { compression: true }
    );
    const contenidoPdf = tablasPdf.flatMap(tabla => tabla.body || []).flat();
    expect(contenidoPdf).toContain('Vendedor Uno');
    expect(contenidoPdf).not.toContain('001');
    expect(contenidoPdf).not.toContain('Principal');
    expect(document.querySelector('.gerencia-print-codigos')).toBeNull();
    expect(guardarPdf).toHaveBeenCalledWith('Estadisticas_Ventas_2026_07.pdf');
  });
});
