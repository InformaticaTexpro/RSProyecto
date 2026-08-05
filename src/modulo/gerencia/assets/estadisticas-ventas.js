'use strict';

(function () {
  const LOGIN_URL = '/src/modulo/varios/login/index.html';
  const NO_ACCESS_URL = '/src/modulo/varios/sin-acceso/index.html';
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  let cargando = false;
  let datosCargados = null;
  let vendedoresPorId = new Map();
  let focoAntesModal = null;

  function normalizarTexto(valor) {
    return String(valor || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function esAdmin(usuario) {
    return usuario?.is_admin === true
      || usuario?.is_admin === 1
      || usuario?.is_admin === '1'
      || normalizarTexto(usuario?.area) === 'admin';
  }

  function tieneAcceso(usuario) {
    return esAdmin(usuario) || normalizarTexto(usuario?.area) === 'gerencia';
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function setText(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  }

  function formatCLP(valor) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Number(valor || 0));
  }

  function formatPorcentaje(valor) {
    if (!Number.isFinite(Number(valor))) return '—';
    return `${Number(valor).toLocaleString('es-CL', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} %`;
  }

  function totalReporte(data) {
    return Number(data?.resumen?.ventaTotal ?? data?.total ?? 0);
  }

  function participacionUnidad(venta, total) {
    return total !== 0 ? (Number(venta || 0) / total) * 100 : 0;
  }

  function gruposPorVenta(data) {
    return [...(data?.grupos || [])].sort((a, b) => (
      Number(b.total || 0) - Number(a.total || 0)
      || String(a.grupo).localeCompare(String(b.grupo), 'es')
    ));
  }

  function periodoReporte(data) {
    return `${MESES[Number(data.mes) - 1]} ${Number(data.anio)}`;
  }

  function nombreArchivo(extension) {
    const mes = String(Number(datosCargados.mes)).padStart(2, '0');
    return `Estadisticas_Ventas_${Number(datosCargados.anio)}_${mes}.${extension}`;
  }

  function setAccionesDisponibles(disponibles) {
    ['btnImprimirEstadisticas', 'btnExcelEstadisticas', 'btnPdfEstadisticas']
      .forEach(id => {
        const boton = document.getElementById(id);
        if (boton) boton.disabled = !disponibles;
      });
  }

  function redirigir(url) {
    window.location.replace(url);
  }

  async function verificarSesion() {
    const token = localStorage.getItem('token');
    if (!token) {
      redirigir(LOGIN_URL);
      return null;
    }
    try {
      const respuesta = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await respuesta.json().catch(() => null);
      const usuario = json?.user || json?.usuario || null;
      if (!respuesta.ok || !usuario) {
        redirigir(LOGIN_URL);
        return null;
      }
      if (!tieneAcceso(usuario)) {
        redirigir(NO_ACCESS_URL);
        return null;
      }
      return usuario;
    } catch (error) {
      console.warn('[estadisticas-ventas] No se pudo validar la sesión:', error.message);
      redirigir(LOGIN_URL);
      return null;
    }
  }

  function cargarIdentidad(usuario) {
    const nombre = usuario.nombre || usuario.email || 'Usuario';
    const iniciales = nombre.split(' ').filter(Boolean).slice(0, 2)
      .map(parte => parte[0]).join('').toUpperCase();
    setText('userName', nombre);
    setText('userArea', usuario.area || (esAdmin(usuario) ? 'Administración' : ''));
    setText('userAvatar', iniciales || 'U');
    setText('chipAvatar', iniciales || 'U');
    setText('chipName', nombre.split(' ')[0]);
    setText('headerDate', new Date().toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }));
  }

  function configurarNavegacion() {
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      redirigir(LOGIN_URL);
    });
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('sidebar--collapsed');
      document.getElementById('mainWrapper')?.classList.toggle('main-wrapper--expanded');
    });
    document.getElementById('headerMenuBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('mobile-open');
    });
  }

  async function apiGet(url) {
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const json = await respuesta.json().catch(() => null);
    if (respuesta.status === 401) {
      redirigir(LOGIN_URL);
      throw new Error('Sesión expirada.');
    }
    if (respuesta.status === 403) {
      redirigir(NO_ACCESS_URL);
      throw new Error('Acceso denegado.');
    }
    if (!respuesta.ok || !json?.ok) {
      throw new Error(json?.error || 'No fue posible obtener las estadísticas.');
    }
    return json.data;
  }

  function cerrarModal() {
    const overlay = document.getElementById('modalCodigosOverlay');
    if (!overlay) return;
    overlay.classList.remove('modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gerencia-modal-open');
    document.getElementById('modalCodigosBody').innerHTML = '';
    document.getElementById('modalCodigosFoot').innerHTML = '';
    if (focoAntesModal?.focus) focoAntesModal.focus();
    focoAntesModal = null;
  }

  function abrirModal(idVendedor, origen) {
    const vendedor = vendedoresPorId.get(idVendedor);
    const overlay = document.getElementById('modalCodigosOverlay');
    if (!vendedor || !overlay) return;
    focoAntesModal = origen || document.activeElement;
    setText('modalCodigosTitulo', 'Detalle de códigos asociados');
    setText(
      'modalCodigosSubtitulo',
      `${vendedor.vendedor} · ${MESES[Number(vendedor.mes) - 1]} ${vendedor.anio}`
    );
    document.getElementById('modalCodigosBody').innerHTML = vendedor.codigos.map(codigo => `
      <tr>
        <td><code>${escapeHtml(codigo.codigo)}</code></td>
        <td>${escapeHtml(codigo.descripcion)}</td>
        <td>${escapeHtml(codigo.grupo)}</td>
        <td class="numero">${formatCLP(codigo.neto)}</td>
        <td class="numero">${formatPorcentaje(codigo.participacion)}</td>
      </tr>
    `).join('');
    document.getElementById('modalCodigosFoot').innerHTML = `
      <tr>
        <th colspan="3">Total consolidado</th>
        <th class="numero">${formatCLP(vendedor.neto)}</th>
        <th class="numero">${vendedor.neto !== 0 ? '100 %' : '—'}</th>
      </tr>
    `;
    overlay.classList.add('modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gerencia-modal-open');
    document.getElementById('modalCodigosCerrar')?.focus();
  }

  function limpiarResultados(mensaje = '') {
    vendedoresPorId = new Map();
    document.getElementById('gruposEstadisticas').innerHTML = '';
    const estado = document.getElementById('estadoEstadisticas');
    estado.hidden = !mensaje;
    estado.textContent = mensaje;
    cerrarModal();
  }

  function renderResumen(data, mes, anio) {
    const periodoMes = Number(data?.mes || mes);
    const periodoAnio = Number(data?.anio || anio);
    setText(
      'tituloResumenGeneral',
      periodoMes && periodoAnio
        ? `Resumen general — ${MESES[periodoMes - 1]} ${periodoAnio}`
        : 'Resumen general'
    );
    if (!data) {
      ['resumenVentaTotal', 'resumenUnidades', 'resumenVendedores', 'resumenCodigos']
        .forEach(id => setText(id, '—'));
      return;
    }

    const resumen = data.resumen || {};
    setText('resumenVentaTotal', formatCLP(resumen.ventaTotal ?? data.total));
    setText('resumenUnidades', Number(resumen.cantidadUnidades || 0).toLocaleString('es-CL'));
    setText('resumenVendedores', Number(resumen.cantidadVendedores || 0).toLocaleString('es-CL'));
    setText('resumenCodigos', Number(resumen.cantidadCodigos || 0).toLocaleString('es-CL'));
  }

  function renderResumenUnidades(data) {
    const body = document.getElementById('resumenUnidadesBody');
    const foot = document.getElementById('resumenUnidadesFoot');
    if (!body || !foot) return;
    const total = totalReporte(data);
    body.innerHTML = gruposPorVenta(data).map(grupo => `
      <tr>
        <td>${escapeHtml(grupo.grupo)}</td>
        <td class="numero">${formatCLP(grupo.total)}</td>
        <td class="numero">${formatPorcentaje(participacionUnidad(grupo.total, total))}</td>
      </tr>
    `).join('');
    foot.innerHTML = `
      <tr class="gerencia-total-resumen">
        <th>Total</th>
        <th class="numero">${formatCLP(total)}</th>
        <th class="numero">${formatPorcentaje(total !== 0 ? 100 : 0)}</th>
      </tr>
    `;
  }

  function prepararImpresion() {
    if (!datosCargados) return;
    setText('periodoImpresion', `Período: ${periodoReporte(datosCargados)}`);
    setText('fechaImpresion', `Fecha de emisión: ${new Date().toLocaleString('es-CL')}`);
    window.print();
  }

  function aplicarFormatoNumerico(hoja, columnas, formato, desdeFila = 1) {
    const rango = window.XLSX.utils.decode_range(hoja['!ref']);
    columnas.forEach(columna => {
      for (let fila = desdeFila; fila <= rango.e.r; fila += 1) {
        const celda = hoja[window.XLSX.utils.encode_cell({ r: fila, c: columna })];
        if (celda && typeof celda.v === 'number') celda.z = formato;
      }
    });
  }

  function exportarExcel() {
    if (!datosCargados || !window.XLSX) {
      setText('mensajeEstadisticas', 'No fue posible iniciar la exportación a Excel.');
      return;
    }

    const data = datosCargados;
    const total = totalReporte(data);
    const resumenUnidades = gruposPorVenta(data);
    const resumenFilas = [
      ['Estadísticas de Ventas por Vendedor'],
      ['Mes', MESES[Number(data.mes) - 1]],
      ['Año', Number(data.anio)],
      ['Venta total', total],
      ['Cantidad de unidades', Number(data.resumen?.cantidadUnidades || data.grupos.length)],
      ['Cantidad de vendedores', Number(data.resumen?.cantidadVendedores || 0)],
      ['Cantidad de códigos', Number(data.resumen?.cantidadCodigos || 0)],
      [],
      ['Unidad', 'Venta', 'Participación'],
      ...resumenUnidades.map(grupo => [
        grupo.grupo,
        Number(grupo.total || 0),
        participacionUnidad(grupo.total, total) / 100,
      ]),
      ['Total', total, total !== 0 ? 1 : 0],
    ];
    const detalleFilas = [[
      'Unidad de negocio',
      'Vendedor principal',
      'Cantidad de códigos asociados',
      'Venta consolidada',
      'Participación en la unidad',
    ]];
    const codigosFilas = [[
      'Unidad de negocio',
      'Vendedor principal',
      'Código asociado',
      'Descripción',
      'Venta',
      'Participación dentro del vendedor',
    ]];
    const codigosIncluidos = new Set();

    data.grupos.forEach(grupo => {
      grupo.vendedores.forEach(vendedor => {
        detalleFilas.push([
          grupo.grupo,
          vendedor.vendedor,
          Number(vendedor.cantidadCodigos || vendedor.codigos.length),
          Number(vendedor.neto || 0),
          Number(vendedor.participacion || 0) / 100,
        ]);
        vendedor.codigos.forEach(codigo => {
          const clave = `${grupo.grupo}\u0000${vendedor.vendedor}\u0000${codigo.codigo}`;
          if (codigosIncluidos.has(clave)) return;
          codigosIncluidos.add(clave);
          codigosFilas.push([
            grupo.grupo,
            vendedor.vendedor,
            String(codigo.codigo),
            codigo.descripcion,
            Number(codigo.neto || 0),
            Number(codigo.participacion || 0) / 100,
          ]);
        });
      });
    });

    const libro = window.XLSX.utils.book_new();
    const hojaResumen = window.XLSX.utils.aoa_to_sheet(resumenFilas);
    const hojaDetalle = window.XLSX.utils.aoa_to_sheet(detalleFilas);
    const hojaCodigos = window.XLSX.utils.aoa_to_sheet(codigosFilas);
    hojaResumen['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 18 }];
    hojaDetalle['!cols'] = [
      { wch: 28 }, { wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 26 },
    ];
    hojaCodigos['!cols'] = [
      { wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 36 }, { wch: 18 }, { wch: 30 },
    ];
    if (hojaResumen.B4) hojaResumen.B4.z = '$#,##0';
    aplicarFormatoNumerico(hojaResumen, [1], '$#,##0', 9);
    aplicarFormatoNumerico(hojaResumen, [2], '0.0%', 9);
    aplicarFormatoNumerico(hojaDetalle, [3], '$#,##0');
    aplicarFormatoNumerico(hojaDetalle, [4], '0.0%');
    aplicarFormatoNumerico(hojaCodigos, [4], '$#,##0');
    aplicarFormatoNumerico(hojaCodigos, [5], '0.0%');
    window.XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');
    window.XLSX.utils.book_append_sheet(libro, hojaDetalle, 'Detalle por unidad');
    window.XLSX.utils.book_append_sheet(libro, hojaCodigos, 'Códigos asociados');
    window.XLSX.writeFile(libro, nombreArchivo('xlsx'), { compression: true });
  }

  function autoTable(doc, opciones) {
    if (typeof doc.autoTable === 'function') {
      doc.autoTable(opciones);
      return;
    }
    if (typeof window.jspdfAutoTable?.autoTable === 'function') {
      window.jspdfAutoTable.autoTable(doc, opciones);
      return;
    }
    throw new Error('El generador de tablas PDF no está disponible.');
  }

  function exportarPdf() {
    if (!datosCargados || !window.jspdf?.jsPDF) {
      setText('mensajeEstadisticas', 'No fue posible iniciar la exportación a PDF.');
      return;
    }
    try {
      const data = datosCargados;
      const total = totalReporte(data);
      const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const estilosTabla = {
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak' },
        headStyles: { fillColor: [8, 120, 100], textColor: 255 },
        margin: { top: 8, right: 8, bottom: 9, left: 8 },
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
      };
      doc.setTextColor(8, 120, 100);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('TEXPRO', 8, 9);
      doc.setTextColor(26, 29, 35);
      doc.setFontSize(17);
      doc.text('Estadísticas de Ventas por Vendedor', 8, 17);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Período: ${periodoReporte(data)}`, 8, 22);
      doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-CL')}`, 8, 27);
      autoTable(doc, {
        ...estilosTabla,
        startY: 30,
        head: [['Venta total', 'Unidades', 'Vendedores', 'Códigos']],
        body: [[
          formatCLP(total),
          Number(data.resumen?.cantidadUnidades || data.grupos.length),
          Number(data.resumen?.cantidadVendedores || 0),
          Number(data.resumen?.cantidadCodigos || 0),
        ]],
      });
      autoTable(doc, {
        ...estilosTabla,
        startY: doc.lastAutoTable.finalY + 4,
        head: [['Unidad', 'Venta', 'Participación']],
        body: gruposPorVenta(data).map(grupo => [
          grupo.grupo,
          formatCLP(grupo.total),
          formatPorcentaje(participacionUnidad(grupo.total, total)),
        ]),
        foot: [['Total', formatCLP(total), formatPorcentaje(total !== 0 ? 100 : 0)]],
        footStyles: { fillColor: [228, 248, 241], textColor: [7, 95, 80], fontStyle: 'bold' },
      });

      data.grupos.forEach(grupo => {
        let inicio = doc.lastAutoTable.finalY + 6;
        if (inicio > 182) {
          doc.addPage();
          inicio = 10;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${grupo.grupo} — ${formatCLP(grupo.total)}`, 8, inicio);
        autoTable(doc, {
          ...estilosTabla,
          startY: inicio + 2,
          head: [['Vendedor principal', 'Códigos asociados', 'Venta consolidada', 'Participación']],
          body: grupo.vendedores.map(vendedor => [
            vendedor.vendedor,
            Number(vendedor.cantidadCodigos || vendedor.codigos.length),
            formatCLP(vendedor.neto),
            formatPorcentaje(vendedor.participacion),
          ]),
          foot: [['TOTAL UNIDAD', '', formatCLP(grupo.total), grupo.total !== 0 ? '100,0 %' : '0,0 %']],
          footStyles: { fillColor: [228, 248, 241], textColor: [7, 95, 80], fontStyle: 'bold' },
        });
      });

      const paginas = doc.getNumberOfPages();
      for (let pagina = 1; pagina <= paginas; pagina += 1) {
        doc.setPage(pagina);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(`Página ${pagina} de ${paginas}`, 285, 203, { align: 'right' });
      }
      doc.save(nombreArchivo('pdf'));
    } catch (error) {
      setText('mensajeEstadisticas', `No fue posible exportar el PDF: ${error.message}`);
    }
  }

  function renderGrupos(data) {
    const contenedor = document.getElementById('gruposEstadisticas');
    vendedoresPorId = new Map();
    renderResumen(data);
    renderResumenUnidades(data);
    if (!data.grupos?.length) {
      limpiarResultados(`No existen ventas para ${MESES[data.mes - 1]} de ${data.anio}.`);
      return;
    }

    document.getElementById('estadoEstadisticas').hidden = true;
    let correlativo = 0;
    contenedor.innerHTML = data.grupos.map(grupo => {
      const filas = grupo.vendedores.map(vendedor => {
        correlativo += 1;
        const id = `vendedor-${correlativo}`;
        vendedoresPorId.set(id, {
          ...vendedor,
          mes: data.mes,
          anio: data.anio,
        });
        return `
          <tr>
            <td>
              <button class="gerencia-vendedor-btn estadisticas-vendedor-btn" type="button" data-vendedor-id="${id}">
                ${escapeHtml(vendedor.vendedor)}
                <span class="gerencia-codigo">Código principal: ${escapeHtml(vendedor.codigoPrincipal)}</span>
              </button>
              <span class="gerencia-print-vendedor">${escapeHtml(vendedor.vendedor)}</span>
            </td>
            <td class="numero">${Number(vendedor.cantidadCodigos || 0).toLocaleString('es-CL')}</td>
            <td class="numero">${formatCLP(vendedor.neto)}</td>
            <td class="numero">${formatPorcentaje(vendedor.participacion)}</td>
          </tr>
        `;
      }).join('');
      return `
        <section class="tabla-seccion gerencia-grupo-card">
          <div class="tabla-card">
            <div class="gerencia-unidad-header">
              <h3>🏢 ${escapeHtml(grupo.grupo)}</h3>
              <p>${grupo.vendedores.length.toLocaleString('es-CL')} vendedor(es) · ${formatCLP(grupo.total)}</p>
            </div>
            <div class="tabla-wrapper">
              <table class="dash-tabla">
                <thead><tr><th>Vendedor</th><th class="numero">Códigos asociados</th><th class="numero">Neto</th><th class="numero">Participación</th></tr></thead>
                <tbody>${filas}</tbody>
                <tfoot><tr class="gerencia-total-unidad"><th colspan="2">TOTAL UNIDAD</th><th class="numero">${formatCLP(grupo.total)}</th><th class="numero">${formatPorcentaje(grupo.total !== 0 ? 100 : 0)}</th></tr></tfoot>
              </table>
            </div>
          </div>
        </section>
      `;
    }).join('');
  }

  async function actualizar() {
    if (cargando) return;
    const mes = Number(document.getElementById('filtroMesEstadisticas')?.value);
    const anio = Number(document.getElementById('filtroAnioEstadisticas')?.value);
    const boton = document.getElementById('btnActualizarEstadisticas');
    cargando = true;
    datosCargados = null;
    boton.disabled = true;
    boton.textContent = 'Cargando…';
    setAccionesDisponibles(false);
    setText('mensajeEstadisticas', '');
    renderResumen(null, mes, anio);
    renderResumenUnidades(null);
    limpiarResultados('Cargando estadísticas…');

    try {
      const params = new URLSearchParams({ mes: String(mes), anio: String(anio) });
      const data = await apiGet(`/api/gerencia/comercial/estadisticas-ventas?${params}`);
      datosCargados = data.grupos?.length ? data : null;
      renderGrupos(data);
    } catch (error) {
      datosCargados = null;
      limpiarResultados('');
      renderResumen(null, mes, anio);
      renderResumenUnidades(null);
      setText('mensajeEstadisticas', error.message);
    } finally {
      cargando = false;
      boton.disabled = false;
      boton.textContent = 'Actualizar';
      setAccionesDisponibles(Boolean(datosCargados));
    }
  }

  function configurarFiltros() {
    const hoy = new Date();
    const mes = document.getElementById('filtroMesEstadisticas');
    const anio = document.getElementById('filtroAnioEstadisticas');
    mes.innerHTML = MESES.map((nombre, indice) => (
      `<option value="${indice + 1}">${nombre}</option>`
    )).join('');
    mes.value = String(hoy.getMonth() + 1);

    const anios = [];
    for (let valor = hoy.getFullYear() + 1; valor >= 2000; valor -= 1) anios.push(valor);
    anio.innerHTML = anios.map(valor => `<option value="${valor}">${valor}</option>`).join('');
    anio.value = String(hoy.getFullYear());
  }

  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;
    cargarIdentidad(usuario);
    configurarNavegacion();
    configurarFiltros();
    document.getElementById('btnActualizarEstadisticas')?.addEventListener('click', actualizar);
    document.getElementById('btnImprimirEstadisticas')?.addEventListener('click', prepararImpresion);
    document.getElementById('btnExcelEstadisticas')?.addEventListener('click', exportarExcel);
    document.getElementById('btnPdfEstadisticas')?.addEventListener('click', exportarPdf);
    document.getElementById('gruposEstadisticas')?.addEventListener('click', evento => {
      const boton = evento.target.closest('.estadisticas-vendedor-btn');
      if (boton) abrirModal(boton.dataset.vendedorId, boton);
    });
    document.getElementById('modalCodigosCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('modalCodigosOverlay')?.addEventListener('click', evento => {
      if (evento.target === evento.currentTarget) cerrarModal();
    });
    document.addEventListener('keydown', evento => {
      if (evento.key === 'Escape') cerrarModal();
    });
    document.body.classList.remove('auth-pending');
    actualizar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
