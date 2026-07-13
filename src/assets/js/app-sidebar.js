'use strict';

/**
 * app-sidebar.js
 * Sidebar central basado en el catálogo de menús activos.
 * Los administradores tienen acceso total. Los demás usuarios acceden por
 * menús asignados y, como compatibilidad, por el área declarada del módulo.
 */
(function () {
  const NO_ACCESS_URL = '/src/modulo/varios/sin-acceso/index.html';

  const FALLBACK_MENUS = [
    { id: 'ventas-dashboard', codigo: 'ventas-dashboard', nombre: 'Dashboard', url: '/src/modulo/ventas/dashboard/index.html', icono: '🏠', grupo: 'Ventas', orden: 10, areas: ['ventas', 'gerencia', 'admin'] },
    { id: 'ventas-asignadas', codigo: 'ventas-asignadas', nombre: 'Ventas Asignadas', url: '/src/modulo/ventas/ventas/index.html', icono: '🤝', grupo