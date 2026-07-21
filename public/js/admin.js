document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const workspaceBtn = document.getElementById('workspaceBtn');
  const workspaceDropdown = document.getElementById('workspaceDropdown');
  const btnConfiguracion = document.getElementById('btnConfiguracion');
  
  const adminLoginModal = document.getElementById('adminLoginModal');
  const adminLoginClose = document.getElementById('adminLoginClose');
  const adminLoginSubmit = document.getElementById('adminLoginSubmit');
  const adminUser = document.getElementById('adminUser');
  const adminPass = document.getElementById('adminPass');

  const adminDashboardModal = document.getElementById('adminDashboardModal');
  const adminDashboardClose = document.getElementById('adminDashboardClose');
  const adminUsersTableBody = document.getElementById('adminUsersTableBody');
  const adminMessagesTableBody = document.getElementById('adminMessagesTableBody');
  const adminTabUsers = document.getElementById('adminTabUsers');
  const adminTabMessages = document.getElementById('adminTabMessages');
  const adminPanelUsers = document.getElementById('adminPanelUsers');
  const adminPanelMessages = document.getElementById('adminPanelMessages');
  const adminMessagesSearch = document.getElementById('adminMessagesSearch');
  const adminMessagesRefresh = document.getElementById('adminMessagesRefresh');

  let adminToken = null;

  // --- Toggle Dropdown ---
  workspaceBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = workspaceDropdown.style.display === 'block';
    workspaceDropdown.style.display = isVisible ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    if (workspaceDropdown) workspaceDropdown.style.display = 'none';
  });

  workspaceDropdown?.addEventListener('click', (e) => e.stopPropagation());

  // --- Open Login Modal ---
  btnConfiguracion?.addEventListener('click', () => {
    workspaceDropdown.style.display = 'none';
    if (adminToken) {
      openAdminDashboard();
    } else {
      adminLoginModal.style.display = 'flex';
      adminUser.value = '';
      adminPass.value = '';
      setTimeout(() => adminUser.focus(), 100);
    }
  });

  adminLoginClose?.addEventListener('click', () => {
    adminLoginModal.style.display = 'none';
  });

  // --- Authenticate ---
  adminLoginSubmit?.addEventListener('click', async () => {
    const user = adminUser.value.trim();
    const pass = adminPass.value;
    
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      
      if (data.ok) {
        adminToken = data.token;
        adminLoginModal.style.display = 'none';
        openAdminDashboard();
      } else {
        alert(data.error || 'Credenciales inválidas');
      }
    } catch (err) {
      alert('Error al intentar autenticar: ' + err.message);
    }
  });

  adminDashboardClose?.addEventListener('click', () => {
    adminDashboardModal.style.display = 'none';
  });

  // --- Tab Switching ---
  adminTabUsers?.addEventListener('click', () => {
    adminPanelUsers.style.display = 'flex';
    adminPanelMessages.style.display = 'none';
    adminTabUsers.classList.add('active');
    adminTabMessages.classList.remove('active');
    fetchAndRenderUsers();
  });

  adminTabMessages?.addEventListener('click', () => {
    adminPanelUsers.style.display = 'none';
    adminPanelMessages.style.display = 'flex';
    adminTabMessages.classList.add('active');
    adminTabUsers.classList.remove('active');
    fetchAndRenderMessages();
  });

  adminMessagesRefresh?.addEventListener('click', fetchAndRenderMessages);
  adminMessagesSearch?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchAndRenderMessages();
  });

  // --- Open Dashboard & Fetch Users ---
  async function openAdminDashboard() {
    adminDashboardModal.style.display = 'flex';
    await fetchAndRenderUsers();
  }

  async function fetchAndRenderUsers() {
    adminUsersTableBody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      
      if (data.ok) {
        renderUsersTable(data.data);
      } else {
        adminUsersTableBody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${data.error}</td></tr>`;
      }
    } catch (err) {
      adminUsersTableBody.innerHTML = `<tr><td colspan="5" style="color:red">Error de red: ${err.message}</td></tr>`;
    }
  }

  function renderUsersTable(users) {
    adminUsersTableBody.innerHTML = '';
    if (users.length === 0) {
      adminUsersTableBody.innerHTML = '<tr><td colspan="5">No hay usuarios.</td></tr>';
      return;
    }
    
    users.forEach(user => {
      const tr = document.createElement('tr');
      
      const lastConn = user.lastConnection ? new Date(user.lastConnection).toLocaleString('es-MX') : 'N/A';
      const isOnline = window.ChatModule && typeof window.ChatModule.getCurrentChannelId === 'function' ? window._onlineUsers?.has(user.username) : false;
      
      const statusBadge = user.isDisabled 
        ? `<span class="sa-status disabled">Deshabilitado</span>`
        : `<span class="sa-status active">Activo</span>`;
        
      const toggleAction = user.isDisabled ? 'Habilitar' : 'Deshabilitar';
      const btnClass = user.isDisabled ? 'sa-action-btn' : 'sa-action-btn danger';
      
      tr.innerHTML = `
        <td><strong>${user.username}</strong></td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${user.device}">${user.device || 'Desconocido'}</td>
        <td>${lastConn}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="${btnClass} toggle-user-btn" data-username="${user.username}">
            ${toggleAction}
          </button>
        </td>
      `;
      adminUsersTableBody.appendChild(tr);
    });
    
    // Add event listeners to buttons
    document.querySelectorAll('.toggle-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const username = e.target.dataset.username;
        if (confirm(`¿Estás seguro de que quieres cambiar el estado de acceso de ${username}?`)) {
          await toggleUserStatus(username);
        }
      });
    });
  }

  async function toggleUserStatus(username) {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.ok) {
        fetchAndRenderUsers();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Error toggling status: ' + err.message);
    }
  }

  // --- Messages Tab Logic ---
  async function fetchAndRenderMessages() {
    adminMessagesTableBody.innerHTML = '<tr><td colspan="4">Cargando mensajes...</td></tr>';
    const search = adminMessagesSearch.value.trim();
    
    try {
      const res = await fetch(`/api/admin/messages?search=${encodeURIComponent(search)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      
      if (data.ok) {
        renderMessagesTable(data.data);
      } else {
        adminMessagesTableBody.innerHTML = `<tr><td colspan="4" style="color:red">Error: ${data.error}</td></tr>`;
      }
    } catch (err) {
      adminMessagesTableBody.innerHTML = `<tr><td colspan="4" style="color:red">Error de red: ${err.message}</td></tr>`;
    }
  }

  function renderMessagesTable(messages) {
    adminMessagesTableBody.innerHTML = '';
    if (messages.length === 0) {
      adminMessagesTableBody.innerHTML = '<tr><td colspan="4">No hay mensajes encontrados.</td></tr>';
      return;
    }
    
    messages.forEach(msg => {
      const tr = document.createElement('tr');
      const dateStr = new Date(msg.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
      
      tr.innerHTML = `
        <td><strong>${msg.autor}</strong></td>
        <td style="word-break: break-word;">${msg.texto}</td>
        <td>${dateStr}</td>
        <td>
          <button class="sa-action-btn danger delete-msg-btn" data-id="${msg._id}">
            Eliminar
          </button>
        </td>
      `;
      adminMessagesTableBody.appendChild(tr);
    });
    
    // Listeners para eliminar mensajes
    document.querySelectorAll('.delete-msg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('¿Estás seguro de que quieres eliminar este mensaje permanentemente?')) {
          await deleteMessage(id);
        }
      });
    });
  }

  async function deleteMessage(id) {
    try {
      const res = await fetch(`/api/admin/messages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.ok) {
        fetchAndRenderMessages();
        // Opcional: Emitir por socket para borrar en tiempo real del DOM a los clientes conectados si se necesita
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Error eliminando mensaje: ' + err.message);
    }
  }
});

