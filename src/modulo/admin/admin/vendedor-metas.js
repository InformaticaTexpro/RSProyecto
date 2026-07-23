'use strict';

(function () {
  const API = '/api/admin';
  const numberFmt = new Intl.NumberFormat('es-CL');

  const state = {
    users: [],
    metas: [],
    selectedId: null,
    selectedUserId: null,
    selectedTipo: 'mensual',
    selectedAnio: new Date().getFullYear(),
    selectedMes: new Date().getMonth() + 1,
    selectedMeta: '',
    selectedObservacion: '',
  };

  function token() {
    return localStorage.getItem('token')
      || sessionStorage.getItem('token')
      || sessionStorage.getItem('access_token')
      || '';
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function escHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function formatAreaLabel(value) {
    const key = String(value || '').trim().toLowerCase();
    const labels = {
      ventas: 'Ventas',
      produccion: 'Producci�n',
      bodega: 'Bodega',
      'servicio-tecnico': 'Servicio T�cnico',
      facturacion: 'Facturaci�n',
      contabilidad: 'Contabilidad',
      rrhh: 'RRHH',
      gerencia: 'Gerencia',
      administracion: 'Administraci�n',
      admin: 'Administraci�n',
    };
    return labels[key] || String(value || 'Sin �rea');
  }

  function formatDate(value) {
    const text = String(value || '').slice(0, 10);
    return text || '�';
  }

  function effectiveMeta(meta) {
    const raw = Number(meta?.meta || 0) || 0;
    return raw;
  }

  function parseMetaAmount(value) {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const compact = String(value).trim().replace(/[\s.,]/g, '');
    const parsedCompact = Number(compact);
    return Number.isFinite(parsedCompact) ? parsedCompact : 0;
  }  function renderMetaPreview() {
    const tipo = String(document.getElementById('metaTipoSelect')?.value || state.selectedTipo || 'mensual');
    const metaOriginal = parseMetaAmount(document.getElementById('metaValorInput')?.value || state.selectedMeta || 0);
    const previewMain = document.getElementById('metaPreviewMain');
    const previewSub = document.getElementById('metaPreviewSub');
    const help = document.getElementById('metaHelp');

    if (previewMain) {
      previewMain.textContent = tipo === 'anual'
        ? `Meta anual ingresada: ${numberFmt.format(metaOriginal)}`
        : `Meta mensual: ${numberFmt.format(metaOriginal)}`;
    }
    if (previewSub) {
      previewSub.textContent = tipo === 'anual'
        ? `Meta aplicada a cada mes: ${numberFmt.format(metaOriginal)}`
        : 'La meta mensual se usa completa solo para el mes seleccionado.';
    }
    if (help) {
      help.textContent = tipo === 'anual'
        ? 'La meta anual corresponde al total del a�o. En el dashboard mensual se usar� el mismo monto en cada mes.'
        : 'La meta mensual se usa completa solo para el mes seleccionado.';
    }
  }

  function updateHelp(message) {
    const help = document.getElementById('metaHelp');
    if (help && message) help.textContent = message;
  }

  function userOptions(selectedId = '') {
    return state.users.map(user => `
      <option value="${escHtml(user.id)}" ${Number(selectedId) === Number(user.id) ? 'selected' : ''}>
        ${escHtml(user.nombre)} � ${escHtml(formatAreaLabel(user.area))}
      </option>
    `).join('');
  }

  function monthOptions(selected = 1) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return months.map((label, index) => `
      <option value="${index + 1}" ${Number(selected) === index + 1 ? 'selected' : ''}>${label}</option>
    `).join('');
  }

  function resetForm() {
    state.selectedId = null;
    state.selectedUserId = state.users[0]?.id || null;
    state.selectedTipo = 'mensual';
    state.selectedAnio = new Date().getFullYear();
    state.selectedMes = new Date().getMonth() + 1;
    state.selectedMeta = '';
    state.selectedObservacion = '';
    renderForm();
    updateHelp('Selecciona un usuario y define la meta mensual o anual. La mensual tiene prioridad sobre la anual.');
  }

  function selectMeta(meta) {
    state.selectedId = Number(meta.id);
    state.selectedUserId = Number(meta.usuario_id);
    state.selectedTipo = meta.tipo_periodo || 'mensual';
    const fecha = String(meta.fecha_formateada || meta.fecha || '').slice(0, 10);
    state.selectedAnio = Number(fecha.slice(0, 4)) || new Date().getFullYear();
    state.selectedMes = Number(fecha.slice(5, 7)) || 1;
    state.selectedMeta = meta.meta;
    state.selectedObservacion = meta.observacion || '';
    renderForm();
    updateHelp('Edici�n de una meta existente. El usuario y el per�odo quedan bloqueados para evitar duplicados.');
  }

  function renderForm() {
    const userSelect = document.getElementById('metaUserSelect');
    const tipoSelect = document.getElementById('metaTipoSelect');
    const anioInput = document.getElementById('metaAnioInput');
    const mesSelect = document.getElementById('metaMesInput');
    const metaInput = document.getElementById('metaValorInput');
    const obsInput = document.getElementById('metaObservacionInput');
    const editing = Boolean(state.selectedId);

    if (userSelect) {
      userSelect.innerHTML = userOptions(state.selectedUserId);
      userSelect.value = state.selectedUserId ? String(state.selectedUserId) : '';
      userSelect.disabled = editing;
    }

    if (tipoSelect) {
      tipoSelect.value = state.selectedTipo;
      tipoSelect.disabled = false;
    }

    if (anioInput) {
      anioInput.value = String(state.selectedAnio);
      anioInput.disabled = editing;
    }

    if (mesSelect) {
      mesSelect.innerHTML = monthOptions(state.selectedMes);
      mesSelect.value = String(state.selectedMes);
      mesSelect.disabled = state.selectedTipo === 'anual';
    }

    if (metaInput) {
      metaInput.value = String(state.selectedMeta ? '');
    }

    if (obsInput) {
      obsInput.value = String(state.selectedObservacion ? '');
    }

    renderMetaPreview();
  }

  function renderTable() {
    const tbody = document.getElementById('vendorMetasTbody');
    if (!tbody) return;

    if (!state.metas.length) {
      tbody.innerHTML = '<tr class="row-empty"><td colspan="9">No hay metas registradas todav�a.</td></tr>';
      return;
    }

    tbody.innerHTML = state.metas.map(meta => {
      const user = state.users.find(item => Number(item.id) === Number(meta.usuario_id));
      const active = meta.activo !== false;
      return `
        <tr>
          <td>${escHtml(meta.usuario_nombre || user?.nombre || 'Sin usuario')}</td>
          <td>${escHtml(formatAreaLabel(meta.usuario_area || user?.area || ''))}</td>
          <td><span class="table-status table-status--admin">${escHtml(meta.tipo_periodo === 'anual' ? 'Anual' : 'Mensual')}</span></td>
          <td>${escHtml(formatDate(meta.fecha_formateada || meta.fecha))}</td>
          <td>${escHtml(numberFmt.format(Number(meta.meta ? 0)))}</td>
          <td>${escHtml(numberFmt.format(Number(meta.meta_mensual ? effectiveMeta(meta))))}</td>
          <td><span class="badge ${active ? 'badge--ok' : 'badge--blocked'}">${active ? 'Activa' : 'Inactiva'}</span></td>
          <td>${escHtml(meta.observacion || '�')}</td>
          <td>
            <div class="action-group">
              <button class="btn-secondary" data-meta-action="edit" data-id="${escHtml(meta.id)}" type="button">Editar</button>
              <button class="${active ? 'btn-danger' : 'btn-secondary'}" data-meta-action="${active ? 'deactivate' : 'activate'}" data-id="${escHtml(meta.id)}" type="button">${active ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function bindEvents() {
    const saveButton = document.getElementById('btnGuardarMeta');
    const clearButton = document.getElementById('btnLimpiarMeta');
    const newButton = document.getElementById('btnNuevaMeta');
    const userSelect = document.getElementById('metaUserSelect');
    const tipoSelect = document.getElementById('metaTipoSelect');
    const anioInput = document.getElementById('metaAnioInput');
    const mesSelect = document.getElementById('metaMesInput');
    const metaInput = document.getElementById('metaValorInput');
    const obsInput = document.getElementById('metaObservacionInput');
    const tbody = document.getElementById('vendorMetasTbody');

    if (saveButton && !saveButton.dataset.bound) {
      saveButton.addEventListener('click', () => saveMeta().catch(showError));
      saveButton.dataset.bound = '1';
    }
    if (clearButton && !clearButton.dataset.bound) {
      clearButton.addEventListener('click', resetForm);
      clearButton.dataset.bound = '1';
    }
    if (newButton && !newButton.dataset.bound) {
      newButton.addEventListener('click', resetForm);
      newButton.dataset.bound = '1';
    }
    if (userSelect && !userSelect.dataset.bound) {
      userSelect.addEventListener('change', event => {
        state.selectedUserId = Number(event.target.value) || null;
      });
      userSelect.dataset.bound = '1';
    }
    if (tipoSelect && !tipoSelect.dataset.bound) {
      tipoSelect.addEventListener('change', event => {
        state.selectedTipo = event.target.value === 'anual' ? 'anual' : 'mensual';
        if (state.selectedTipo === 'anual') state.selectedMes = 1;
        renderForm();
      });
      tipoSelect.dataset.bound = '1';
    }
    if (anioInput && !anioInput.dataset.bound) {
      anioInput.addEventListener('change', event => {
        state.selectedAnio = Number(event.target.value) || new Date().getFullYear();
      });
      anioInput.dataset.bound = '1';
    }
    if (mesSelect && !mesSelect.dataset.bound) {
      mesSelect.addEventListener('change', event => {
        state.selectedMes = Number(event.target.value) || 1;
      });
      mesSelect.dataset.bound = '1';
    }
    if (metaInput && !metaInput.dataset.bound) {
      metaInput.addEventListener('input', event => {
        state.selectedMeta = event.target.value;
        renderMetaPreview();
      });
      metaInput.dataset.bound = '1';
    }
    if (obsInput && !obsInput.dataset.bound) {
      obsInput.addEventListener('input', event => {
        state.selectedObservacion = event.target.value;
      });
      obsInput.dataset.bound = '1';
    }
    if (tbody && !tbody.dataset.bound) {
      tbody.addEventListener('click', event => {
        const btn = event.target.closest('[data-meta-action]');
        if (!btn) return;
        const metaId = Number(btn.dataset.id);
        const meta = state.metas.find(item => Number(item.id) === metaId);
        if (!meta) return;

        if (btn.dataset.metaAction === 'edit') {
          selectMeta(meta);
          return;
        }
        toggleStatus(metaId, btn.dataset.metaAction === 'activate').catch(showError);
      });
      tbody.dataset.bound = '1';
    }
  }

  async function loadData() {
    const [usersRes, metasRes] = await Promise.all([
      apiFetch('/usuarios'),
      apiFetch('/vendedor-metas'),
    ]);

    state.users = Array.isArray(usersRes.data) ? usersRes.data : [];
    state.metas = Array.isArray(metasRes.data) ? metasRes.data : [];
    if (!state.selectedUserId) state.selectedUserId = state.users[0]?.id || null;

    renderForm();
    renderTable();
    bindEvents();
  }

  function showError(error) {
    const message = error?.message || 'Ocurri� un error.';
    const help = document.getElementById('metaHelp');
    if (help) help.textContent = message;
    console.error('[ADMIN METAS]', error);
  }

  async function saveMeta() {
    const payload = {
      usuario_id: Number(document.getElementById('metaUserSelect')?.value || state.selectedUserId || 0) || null,
      tipo_periodo: document.getElementById('metaTipoSelect')?.value === 'anual' ? 'anual' : 'mensual',
      anio: Number(document.getElementById('metaAnioInput')?.value || state.selectedAnio || 0) || null,
      mes: Number(document.getElementById('metaMesInput')?.value || state.selectedMes || 1) || 1,
      meta: Number(document.getElementById('metaValorInput')?.value || state.selectedMeta || 0),
      observacion: document.getElementById('metaObservacionInput')?.value || '',
      activo: true,
    };

    if (!payload.usuario_id || !payload.anio || !Number.isFinite(payload.meta)) {
      throw new Error('Completa usuario, a�o y meta antes de guardar.');
    }
    if (payload.meta < 0) {
      throw new Error('La meta no puede ser negativa.');
    }
    if (payload.tipo_periodo === 'anual') {
      payload.mes = 1;
    }

    if (state.selectedId) {
      await apiFetch(`/vendedor-metas/${state.selectedId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch('/vendedor-metas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    updateHelp('Meta guardada correctamente.');
    await loadData();
    resetForm();
  }

  async function toggleStatus(metaId, activate) {
    await apiFetch(`/vendedor-metas/${metaId}/${activate ? 'activar' : 'desactivar'}`, {
      method: 'PATCH',
    });
    await loadData();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.querySelector('[data-panel="metas"]');
    if (!panel) return;
    loadData().catch(showError);
  });
})();
