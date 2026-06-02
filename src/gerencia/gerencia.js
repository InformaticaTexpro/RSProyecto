'use strict';

const API = '/api/gerencia';
const token = () => localStorage.getItem('token');
const CURRENT_MODULE = document.body.dataset.module || 'gerencia';

async function verificarSesion() {
  if (!token()) {
    window.location.href = '../login/index.html';
    return null;
  }

  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      window.location.href = '../login/index.html';
      return null;
    }
    return data.user;
  } catch {
    window.location.href = '../login/index.html';
    return null;
  }
}

const MODULOS = [
  { nombre: 'Dashboard',     icon: '🏠', url: '../dashboard/index.html',    area: null, module: 'dashboard' },
  { nombre: 'Ventas',        icon: '📊', url: '../ventas/index.html',       area: ['ventas', 'gerencia'], module: 'ventas' },
  { nombre: 'Facturación',   icon: '🧾', url: '../facturacion/index.html',  area: ['facturacion', 'contabilidad', 'gerencia'], module: 'facturacion' },
  { nombre: 'Bodega',        icon: '🏭', url: '../bodega/index.html',       area: ['bodega', 'produccion', 'gerencia'], module: 'bodega' },
  { nombre: 'Producción',    icon: '⚙️', url: '../produccion/index.html',   area: ['produccion', 'gerencia'], module: 'produccion' },
  { nombre: 'Laboratorio',   icon: '🧪', url: '../laboratorio/index.html',  area: ['laboratorio', 'gerencia'], module: 'laboratorio' },
  { nombre: 'Cobranza',      icon: '💰', url: '../cobranza/index.html',     area: ['cobranza', 'contabilidad', 'gerencia'], module: 'cobranza' },
  { nombre: 'RRHH',          icon: '👥', url: '../rrhh/index.html',         area: ['rrhh', 'gerencia'], module: 'rrhh' },
  { nombre: 'Contabilidad',  icon: '📜', url: '../contabilidad/index.html', area: ['contabilidad', 'gerencia'], module: 'contabilidad' },
  { nombre: 'Gerencia',      icon: '📈', url: '../gerencia/index.html',     area: ['gerencia'], module: 'gerencia' },
  { nombre: 'Administración',icon: '🔧', url: '../admin/index.html',        area: ['admin'], module: 'admin' },
  { nombre: 'Alertas',       icon: '🔔', url: '../alertas/index.html',      area: null, module: 'alertas' },
];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function initSidebar(usuario) {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  const visibles = MODULOS.filter((m) => {
    if (m.area === null) return true;
    if (usuario.is_admin) return true;
    return Array.isArray(m.area) && m.area.includes(usuario.area);
  });

  const svgCasa = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

  nav.innerHTML = `<span class="nav-section-title">NAVEGACIÓN</span>
    <a class="nav-item" href="../dashboard/index.html">
      ${svgCasa}
      <span class="nav-label">Dashboard</span>
    </a>
    ${visibles.map((m) => `
      <a class="nav-item${m.module === CURRENT_MODULE ? ' active' : ''}" href="${m.url}">
        <span style="font-size:1rem">${m.icon}</span>
        <span class="nav-label">${m.nombre}</span>
      </a>`).join('')}`;

  setText('userName', usuario.nombre || usuario.email);
  setText('userArea', usuario.area || 'Sistema');
  setText('userAvatar', (usuario.nombre || usuario.email).charAt(0).toUpperCase());
  setText('chipAvatar', (usuario.nombre || usuario.email).charAt(0).toUpperCase());
  setText('chipName', (usuario.nombre || usuario.email).split(' ')[0]);
  setText('headerDate', new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '../login/index.html';
  });

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar--collapsed');
    document.getElementById('mainWrapper').classList.toggle('main-wrapper--expanded');
  });

  document.getElementById('headerMenuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });
}

function actualizarEstadoUI(data) {
  const loader = document.getElementById('pageLoader');
  const card = document.getElementById('statusCard');
  if (loader) loader.hidden = true;
  if (card) card.hidden = false;

  setText('moduleMessage', data?.mensaje || 'No se pudo cargar la información.');
  setText('statusDate', data?.fecha ? new Date(data.fecha).toLocaleString('es-CL') : '—');
}

async function cargarEstado() {
  try {
    const res = await fetch(`${API}/status`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setText('moduleMessage', data.error || 'Error al consultar el módulo Gerencia.');
      return;
    }
    actualizarEstadoUI(data);
  } catch (err) {
    console.error('[GERENCIA] Error al cargar estado:', err);
    setText('moduleMessage', 'Error de comunicación con el servidor.');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const usuario = await verificarSesion();
  if (!usuario) return;
  initSidebar(usuario);
  await cargarEstado();
});
