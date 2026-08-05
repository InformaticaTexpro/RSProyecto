'use strict';

(function () {
  const LOGIN_URL = '/src/modulo/varios/login/index.html';
  const NO_ACCESS_URL = '/src/modulo/varios/sin-acceso/index.html';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const COLORES = ['#9CA3AF', '#45B7D1', '#00B98A'];
  const COLORES_DONA = ['#00B98A', '#45B7D1', '#F5A623', '#8B5CF6', '#F06543', '#64748B', '#14B8A6', '#3B82F6', '#EAB308', '#A855F7', '#EC4899', '#84CC16'];
  const graficos = {};
  let cargandoAnual = false;
  let cargandoMensual = false;
  let vendedoresActuales = [];
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

  function setText(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function formatCLP(valor) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Number(valor || 0));
  }

  function formatPorcentaje(valor, conSigno = false) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
    const numero = Number(valor);
    const signo = conSigno && numero > 0 ? '+' : '';
    return `${signo}${numero.toLocaleString('es-CL', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} %`;
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
      console.warn('[gerencia] No se pudo validar la sesión:', error.message);
      redirigir(LOGIN_URL);
      return null;
    }
  }

  function cargarIdentidad(usuario) {
    const nombre = usuario.nombre || usuario.email || 'Usuario';
    const iniciales = nombre.split(' ').filter(Boolean).slice(0, 2).map(parte => parte[0]).join('').toUpperCase();
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
    const token = localStorage.getItem('token');
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
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
      throw new Error(json?.error || 'No fue posible obtener los datos.');
    }
    return json.data;
  }

  function destruirGrafico(nombre) {
    if (graficos[nombre]) {
      graficos[nombre].destroy();
      graficos[nombre] = null;
    }
  }

  function crearGrafico(nombre, canvasId, configuracion) {
    destruirGrafico(nombre);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.parentElement?.querySelector('.chart-fallback')?.remove();

    if (!window.Chart) {
      canvas.hidden = true;
      const fallback = document.createElement('div');
      fallback.className = 'chart-fallback';
      fallback.textContent = 'El gráfico no está disponible. La tabla continúa operativa.';
      canvas.parentElement?.appendChild(fallback);
      return;
    }
    canvas.hidden = false;
    graficos[nombre] = new window.Chart(canvas, configuracion);
  }

  function mostrarGraficoVacio(nombre, canvasId, mensaje) {
    destruirGrafico(nombre);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.hidden = true;
    canvas.parentElement?.querySelector('.chart-fallback')?.remove();
    const fallback = document.createElement('div');
    fallback.className = 'chart-fallback';
    fallback.textContent = mensaje;
    canvas.parentElement?.appendChild(fallback);
  }

  function opcionesGraficoMoneda() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 9 } },
        tooltip: { callbacks: { label: contexto => ` ${contexto.dataset.label}: ${formatCLP(contexto.parsed.y ?? contexto.parsed.x)}` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: valor => `$${Math.round(Number(valor) / 1000000)}M` }, grid: { color: 'rgba(107,114,128,.12)' } },
        x: { grid: { display: false } },
      },
    };
  }

  function claseTendencia(valor) {
    if (valor === null || valor === undefined) return '';
    return Number(valor) >= 0 ? 'trend-positive' : 'trend-negative';
  }

  function opcionesGraficoDona() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 9, font: { family: 'Montserrat', size: 10 } },
        },
        tooltip: {
          callbacks: {
            label: contexto => ` ${contexto.label}: ${formatCLP(contexto.parsed)}`,
          },
        },
      },
    };
  }

  function renderLineas({ categorias = [], total = 0, tipo }) {
    const esAnual = tipo === 'anual';
    const sufijo = esAnual ? 'Anual' : 'Mensual';
    const nombreGrafico = esAnual ? 'lineasAnual' : 'lineasMensual';
    const canvasId = `graficoLineas${sufijo}`;
    const tbody = document.getElementById(`tablaLineas${sufijo}Body`);
    const tfoot = document.getElementById(`tablaLineas${sufijo}Foot`);

    if (tbody) {
      tbody.innerHTML = categorias.length
        ? categorias.map(item => `<tr>
            <td>${escapeHtml(item.categoria)}</td>
            <td class="numero">${formatCLP(item.venta)}</td>
            <td class="numero">${formatPorcentaje(item.participacion)}</td>
          </tr>`).join('')
        : '<tr><td colspan="3" class="gerencia-empty">Sin ventas por categoría para el período.</td></tr>';
    }
    if (tfoot) {
      tfoot.innerHTML = `<tr><th>Total</th><th class="numero">${formatCLP(total)}</th><th class="numero">${categorias.length ? '100 %' : '—'}</th></tr>`;
    }

    if (!categorias.length) {
      mostrarGraficoVacio(nombreGrafico, canvasId, 'Sin ventas por categoría para el período.');
      return;
    }
    crearGrafico(nombreGrafico, canvasId, {
      type: 'doughnut',
      data: {
        labels: categorias.map(item => item.categoria),
        datasets: [{
          data: categorias.map(item => Number(item.venta || 0)),
          backgroundColor: categorias.map((_, indice) => COLORES_DONA[indice % COLORES_DONA.length]),
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: opcionesGraficoDona(),
    });
  }

  function renderTopClientes(clientes = []) {
    const tbody = document.getElementById('tablaTopClientesBody');
    if (!tbody) return;
    tbody.innerHTML = clientes.length
      ? clientes.map((cliente, indice) => `<tr>
          <td class="numero">${indice + 1}</td>
          <td><strong>${escapeHtml(cliente.cliente)}</strong><small class="gerencia-codigo">${escapeHtml(cliente.codigoCliente)}</small></td>
          <td class="numero">${formatCLP(cliente.venta)}</td>
          <td class="numero">${formatPorcentaje(cliente.participacion)}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="gerencia-empty">Sin clientes con ventas para el período.</td></tr>';
  }

  function renderTopProductos(productos = []) {
    const tbody = document.getElementById('tablaTopProductosBody');
    if (!tbody) return;
    tbody.innerHTML = productos.length
      ? productos.map((producto, indice) => `<tr>
          <td class="numero">${indice + 1}</td>
          <td><strong>${escapeHtml(producto.producto)}</strong><small class="gerencia-codigo">${escapeHtml(producto.codigoProducto)}</small></td>
          <td>${escapeHtml(producto.categoria)}</td>
          <td class="numero">${formatCLP(producto.venta)}</td>
          <td class="numero">${formatPorcentaje(producto.participacion)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="gerencia-empty">Sin productos con ventas para el período.</td></tr>';
  }

  function renderVendedores(vendedores = []) {
    vendedoresActuales = vendedores;
    const tbody = document.getElementById('tablaVendedoresBody');
    if (!tbody) return;
    tbody.innerHTML = vendedores.length
      ? vendedores.map(vendedor => `<tr>
          <td>
            <button class="gerencia-vendedor-btn" type="button" data-codigo-principal="${escapeHtml(vendedor.codigoPrincipal)}">
              ${escapeHtml(vendedor.vendedor)}
            </button>
            <small class="gerencia-codigo">${escapeHtml(vendedor.codigoPrincipal)} · ${vendedor.cantidadCodigos} código${vendedor.cantidadCodigos === 1 ? '' : 's'}</small>
          </td>
          <td class="numero">${formatCLP(vendedor.venta)}</td>
          <td class="numero">${formatCLP(vendedor.ventaReal)}</td>
          <td class="numero">${formatPorcentaje(vendedor.porcentajeDescuento)}</td>
          <td class="numero">${vendedor.meta > 0 ? formatCLP(vendedor.meta) : '—'}</td>
          <td class="numero ${vendedor.cumplimiento === null ? '' : claseTendencia(vendedor.cumplimiento - 100)}">${formatPorcentaje(vendedor.cumplimiento)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="gerencia-empty">Sin vendedores con ventas o metas para el período.</td></tr>';
  }

  function cerrarModalVendedor() {
    const overlay = document.getElementById('modalVendedorOverlay');
    if (!overlay?.classList.contains('modal-overlay--visible')) return;
    overlay.classList.remove('modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gerencia-modal-open');
    focoAntesModal?.focus();
    focoAntesModal = null;
  }

  function abrirModalVendedor(codigoPrincipal, disparador) {
    const vendedor = vendedoresActuales.find(item => String(item.codigoPrincipal) === String(codigoPrincipal));
    const overlay = document.getElementById('modalVendedorOverlay');
    const tbody = document.getElementById('modalVendedorBody');
    const tfoot = document.getElementById('modalVendedorFoot');
    if (!vendedor || !overlay || !tbody || !tfoot) return;

    focoAntesModal = disparador || document.activeElement;
    setText('modalVendedorTitulo', 'Detalle del vendedor');
    setText('modalVendedorSubtitulo', `${vendedor.vendedor} · Código principal ${vendedor.codigoPrincipal}`);
    tbody.innerHTML = vendedor.codigos.map(codigo => `<tr>
      <td><strong>${escapeHtml(codigo.codigo)}</strong></td>
      <td>${escapeHtml(codigo.nombreAsociado)}</td>
      <td class="numero">${formatCLP(codigo.venta)}</td>
      <td class="numero">${formatCLP(codigo.ventaReal)}</td>
      <td class="numero">${formatPorcentaje(codigo.porcentajeDescuento)}</td>
      <td class="numero">${codigo.meta > 0 ? formatCLP(codigo.meta) : '—'}</td>
      <td class="numero">${formatPorcentaje(codigo.cumplimiento)}</td>
    </tr>`).join('');
    tfoot.innerHTML = `<tr>
      <th colspan="2">Total consolidado</th>
      <th class="numero">${formatCLP(vendedor.venta)}</th>
      <th class="numero">${formatCLP(vendedor.ventaReal)}</th>
      <th class="numero">${formatPorcentaje(vendedor.porcentajeDescuento)}</th>
      <th class="numero">${vendedor.meta > 0 ? formatCLP(vendedor.meta) : '—'}</th>
      <th class="numero">${formatPorcentaje(vendedor.cumplimiento)}</th>
    </tr>`;
    overlay.classList.add('modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gerencia-modal-open');
    document.getElementById('modalVendedorCerrar')?.focus();
  }

  function prepararCargaMensual() {
    cerrarModalVendedor();
    vendedoresActuales = [];
    mostrarGraficoVacio('lineasMensual', 'graficoLineasMensual', 'Cargando distribución mensual…');
    [
      ['tablaLineasMensualBody', 3],
      ['tablaTopClientesBody', 4],
      ['tablaTopProductosBody', 5],
      ['tablaVendedoresBody', 6],
    ].forEach(([id, columnas]) => {
      const tbody = document.getElementById(id);
      if (tbody) tbody.innerHTML = `<tr><td colspan="${columnas}" class="gerencia-empty">Cargando…</td></tr>`;
    });
  }

  function invalidarDatosMensuales() {
    cerrarModalVendedor();
    vendedoresActuales = [];
    ['kpiVentaMes', 'kpiMetaMes', 'kpiCumplimiento', 'kpiDescuentoMes'].forEach(id => setText(id, '—'));
    setText('metaMesAyuda', '');
    setText('mensajeMensual', 'Actualiza el filtro mensual para cargar datos del año seleccionado.');
    renderLineas({ categorias: [], total: 0, tipo: 'mensual' });
    renderTopClientes([]);
    renderTopProductos([]);
    renderVendedores([]);
  }

  function renderComparativo(data) {
    const { periodos, comparativoMensual, totales } = data;
    const mesesCompletos = Array.from({ length: 12 }, (_, indice) => indice + 1);
    const comparativoNormalizado = mesesCompletos.map((mes) => {
      const fila = comparativoMensual.find(item => Number(item.mes) === mes);
      return {
        mes,
        valores: periodos.map((_, indice) => Number(fila?.valores?.[indice] || 0)),
        variaciones: periodos.map((_, indice) => fila?.variaciones?.[indice] ?? null),
      };
    });
    const head = document.getElementById('tablaComparativoHead');
    const body = document.getElementById('tablaComparativoBody');
    const foot = document.getElementById('tablaComparativoFoot');

    if (head) {
      head.innerHTML = `<tr>
        <th>Mes</th>
        <th class="numero">${periodos[0]}</th>
        <th class="numero">${periodos[1]}</th>
        <th class="numero">Variación ${periodos[1]}</th>
        <th class="numero">${periodos[2]}</th>
        <th class="numero">Variación ${periodos[2]}</th>
      </tr>`;
    }
    if (body) {
      body.innerHTML = comparativoNormalizado.map(fila => `<tr>
        <td>${MESES[fila.mes - 1]}</td>
        <td class="numero">${formatCLP(fila.valores[0])}</td>
        <td class="numero">${formatCLP(fila.valores[1])}</td>
        <td class="numero ${claseTendencia(fila.variaciones[1])}">${formatPorcentaje(fila.variaciones[1], true)}</td>
        <td class="numero">${formatCLP(fila.valores[2])}</td>
        <td class="numero ${claseTendencia(fila.variaciones[2])}">${formatPorcentaje(fila.variaciones[2], true)}</td>
      </tr>`).join('');
    }
    if (foot) {
      foot.innerHTML = `<tr>
        <th>Total</th>
        <th class="numero">${formatCLP(totales.valores[0])}</th>
        <th class="numero">${formatCLP(totales.valores[1])}</th>
        <th class="numero ${claseTendencia(totales.variaciones[1])}">${formatPorcentaje(totales.variaciones[1], true)}</th>
        <th class="numero">${formatCLP(totales.valores[2])}</th>
        <th class="numero ${claseTendencia(totales.variaciones[2])}">${formatPorcentaje(totales.variaciones[2], true)}</th>
      </tr>`;
    }

    setText('subtituloComparativo', `${periodos.join(', ')} · enero a ${MESES[data.mesLimite - 1].toLowerCase()}.`);
    setText('descripcionEvolucion', `Comparación mensual de ${periodos.join(', ')}.`);
    crearGrafico('evolucion', 'graficoEvolucion', {
      type: 'line',
      data: {
        labels: MESES,
        datasets: periodos.map((periodo, indice) => ({
          label: String(periodo),
          data: comparativoNormalizado.map(fila => fila.valores[indice]),
          borderColor: COLORES[indice],
          backgroundColor: `${COLORES[indice]}22`,
          borderWidth: indice === 2 ? 3 : 2,
          tension: 0.3,
        })),
      },
      options: opcionesGraficoMoneda(),
    });
  }

  function setBotonCargando(id, cargando) {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.disabled = cargando;
    boton.textContent = cargando ? 'Actualizando…' : 'Actualizar';
  }

  async function actualizarAnual() {
    if (cargandoAnual) return;
    const anio = Number(document.getElementById('filtroAnio')?.value);
    cargandoAnual = true;
    setBotonCargando('btnActualizarAnual', true);
    setText('mensajeAnual', 'Cargando información comercial…');

    try {
      const data = await apiGet(`/api/gerencia/comercial/resumen?anio=${encodeURIComponent(anio)}`);
      setText('kpiVentasAcumuladas', formatCLP(data.resumen.ventasAcumuladas));
      setText('kpiDescuentoAnual', formatPorcentaje(data.resumen.porcentajeDescuento));
      setText('kpiPromedio', formatCLP(data.resumen.promedioMensual));
      setText('kpiVentasAyuda', `Enero a ${MESES[data.mesLimite - 1].toLowerCase()} de ${data.anioSeleccionado}`);
      renderComparativo(data);
      renderLineas({ categorias: data.categorias || [], total: data.totalCategorias || 0, tipo: 'anual' });
      setText('descripcionLineasAnual', `Distribución de ventas de ${data.anioSeleccionado}.`);
      setText('mensajeAnual', '');
    } catch (error) {
      setText('mensajeAnual', error.message);
    } finally {
      cargandoAnual = false;
      setBotonCargando('btnActualizarAnual', false);
    }
  }

  async function actualizarMensual() {
    if (cargandoMensual) return;
    const anio = Number(document.getElementById('filtroAnio')?.value);
    const mes = Number(document.getElementById('filtroMes')?.value);
    cargandoMensual = true;
    setBotonCargando('btnActualizarMensual', true);
    setText('mensajeMensual', 'Cargando indicadores mensuales…');
    prepararCargaMensual();

    try {
      const data = await apiGet(`/api/gerencia/comercial/mensual?anio=${encodeURIComponent(anio)}&mes=${encodeURIComponent(mes)}`);
      setText('kpiVentaMes', formatCLP(data.ventaMes));
      setText('kpiMetaMes', data.metaDisponible ? formatCLP(data.meta) : '—');
      setText('kpiCumplimiento', formatPorcentaje(data.cumplimiento));
      setText('kpiDescuentoMes', formatPorcentaje(data.porcentajeDescuento));
      setText('metaMesAyuda', data.metaDisponible ? `Meta anual ${anio}` : 'Tabla vendedor_meta no disponible');
      renderLineas({ categorias: data.categorias || [], total: data.totalCategorias || 0, tipo: 'mensual' });
      renderTopClientes(data.clientes || []);
      renderTopProductos(data.productos || []);
      renderVendedores(data.vendedores || []);
      setText('descripcionLineasMensual', `${MESES[mes - 1]} de ${anio}.`);
      setText('mensajeMensual', data.metaDisponible ? '' : 'Las ventas están actualizadas; Meta y Cumplimiento no están disponibles.');
    } catch (error) {
      setText('mensajeMensual', error.message);
    } finally {
      cargandoMensual = false;
      setBotonCargando('btnActualizarMensual', false);
    }
  }

  function iniciarComercial() {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const filtroAnio = document.getElementById('filtroAnio');
    const filtroMes = document.getElementById('filtroMes');
    if (filtroAnio) {
      filtroAnio.innerHTML = Array.from({ length: 10 }, (_, indice) => anioActual - indice)
        .map(anio => `<option value="${anio}">${anio}</option>`).join('');
      filtroAnio.value = String(anioActual);
    }
    if (filtroMes) {
      filtroMes.innerHTML = MESES.map((mes, indice) => `<option value="${indice + 1}">${mes}</option>`).join('');
      filtroMes.value = String(hoy.getMonth() + 1);
    }
    document.getElementById('btnActualizarAnual')?.addEventListener('click', () => {
      invalidarDatosMensuales();
      actualizarAnual();
    });
    document.getElementById('btnActualizarMensual')?.addEventListener('click', actualizarMensual);
    document.getElementById('tablaVendedoresBody')?.addEventListener('click', evento => {
      const boton = evento.target.closest('.gerencia-vendedor-btn');
      if (boton) abrirModalVendedor(boton.dataset.codigoPrincipal, boton);
    });
    document.getElementById('modalVendedorCerrar')?.addEventListener('click', cerrarModalVendedor);
    document.getElementById('modalVendedorOverlay')?.addEventListener('click', evento => {
      if (evento.target === evento.currentTarget) cerrarModalVendedor();
    });
    document.addEventListener('keydown', evento => {
      if (evento.key === 'Escape') cerrarModalVendedor();
    });
    actualizarAnual();
    actualizarMensual();
  }

  // Finanzas mantiene deliberadamente sus mocks y su presentación actual.
  function renderFinanzas() {
    const finanzas = window.GERENCIA_MOCK_DATA?.finanzas;
    if (!finanzas) return;
    const anio = Number(document.getElementById('filtroAnio')?.value || Math.max(...finanzas.years));
    const flujo = finanzas.cashFlow[anio] || { meses: [], ingresos: [], egresos: [] };
    const cuentas = finanzas.accounts.filter(cuenta => cuenta.year === anio);
    const sumar = valores => valores.reduce((total, valor) => total + Number(valor || 0), 0);
    const ingresos = sumar(flujo.ingresos);
    const egresos = sumar(flujo.egresos);
    const porCobrar = sumar(cuentas.filter(cuenta => cuenta.tipo === 'Por cobrar').map(cuenta => cuenta.monto));
    const porPagar = sumar(cuentas.filter(cuenta => cuenta.tipo === 'Por pagar').map(cuenta => cuenta.monto));

    setText('kpiIngresos', formatCLP(ingresos));
    setText('kpiEgresos', formatCLP(egresos));
    setText('kpiFlujoNeto', formatCLP(ingresos - egresos));
    setText('kpiPorCobrar', formatCLP(porCobrar));
    setText('kpiPorPagar', formatCLP(porPagar));
    setText('kpiLiquidez', porPagar ? (porCobrar / porPagar).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

    const tbody = document.getElementById('tablaFinanzasBody');
    if (tbody) {
      tbody.innerHTML = cuentas.map(cuenta => `<tr><td><strong>${String(cuenta.concepto)}</strong></td><td>${String(cuenta.tipo)}</td><td class="numero">${formatCLP(cuenta.monto)}</td><td>${new Intl.DateTimeFormat('es-CL').format(new Date(`${cuenta.vencimiento}T12:00:00`))}</td><td>${String(cuenta.estado)}</td><td>${String(cuenta.responsable)}</td></tr>`).join('');
    }
    crearGrafico('flujo', 'graficoFlujoCaja', {
      type: 'bar',
      data: { labels: flujo.meses, datasets: [
        { label: 'Ingresos', data: flujo.ingresos, backgroundColor: '#00E2A7', borderRadius: 5 },
        { label: 'Egresos', data: flujo.egresos, backgroundColor: '#F06543', borderRadius: 5 },
      ] },
      options: opcionesGraficoMoneda(),
    });
    crearGrafico('egresos', 'graficoEgresos', {
      type: 'doughnut',
      data: { labels: finanzas.expenses.map(item => item.categoria), datasets: [{ data: finanzas.expenses.map(item => item.valor), backgroundColor: ['#00E2A7', '#45B7D1', '#F5A623', '#8B5CF6', '#F06543', '#9CA3AF'] }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%' },
    });
  }

  function iniciarFinanzas() {
    const datos = window.GERENCIA_MOCK_DATA;
    if (!datos?.finanzas) {
      console.error('[gerencia] No se encontraron los mocks de Finanzas.');
      return;
    }
    const select = document.getElementById('filtroAnio');
    if (select) select.innerHTML = [...datos.finanzas.years].sort((a, b) => b - a).map(anio => `<option value="${anio}">${anio}</option>`).join('');
    document.getElementById('btnActualizar')?.addEventListener('click', renderFinanzas);
    renderFinanzas();
  }

  async function init() {
    const tipoDashboard = document.body.dataset.dashboard;
    if (!['comercial', 'finanzas'].includes(tipoDashboard)) return;
    const usuario = await verificarSesion();
    if (!usuario) return;
    cargarIdentidad(usuario);
    configurarNavegacion();
    if (tipoDashboard === 'comercial') iniciarComercial();
    if (tipoDashboard === 'finanzas') iniciarFinanzas();
    document.body.classList.remove('auth-pending');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
