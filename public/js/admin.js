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
    adminPanelUsers.style.display = 'block';
    adminPanelMessages.style.display = 'none';
    adminTabUsers.style.background = 'var(--slack-primary)';
    adminTabUsers.style.color = 'white';
    adminTabUsers.style.border = 'none';
    adminTabMessages.style.background = 'white';
    adminTabMessages.style.color = 'var(--text-main)';
    adminTabMessages.style.border = '1px solid var(--border-color)';
    fetchAndRenderUsers();
  });

  adminTabMessages?.addEventListener('click', () => {
    adminPanelUsers.style.display = 'none';
    adminPanelMessages.style.display = 'block';
    adminTabMessages.style.background = 'var(--slack-primary)';
    adminTabMessages.style.color = 'white';
    adminTabMessages.style.border = 'none';
    adminTabUsers.style.background = 'white';
    adminTabUsers.style.color = 'var(--text-main)';
    adminTabUsers.style.border = '1px solid var(--border-color)';
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
      tr.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
      
      const lastConn = user.lastConnection ? new Date(user.lastConnection).toLocaleString('es-MX') : 'N/A';
      const isOnline = window.ChatModule && typeof window.ChatModule.getCurrentChannelId === 'function' ? window._onlineUsers?.has(user.username) : false;
      const statusBadge = user.isDisabled 
        ? `<span style="background:var(--slack-red); color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Deshabilitado</span>`
        : `<span style="background:var(--slack-green); color:white; padding:2px 8px; border-radius:12px; font-size:12px;">Activo</span>`;
        
      const toggleAction = user.isDisabled ? 'Habilitar' : 'Deshabilitar';
      const actionColor = user.isDisabled ? 'var(--slack-blue)' : 'var(--slack-red)';
      
      tr.innerHTML = `
        <td style="padding: 10px; font-weight: 500;">${user.username}</td>
        <td style="padding: 10px; font-size: 12px; color: var(--text-light); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${user.device}">${user.device || 'Desconocido'}</td>
        <td style="padding: 10px; font-size: 13px;">${lastConn}</td>
        <td style="padding: 10px;">${statusBadge}</td>
        <td style="padding: 10px;">
          <button class="toggle-user-btn" data-username="${user.username}" style="background: ${actionColor}; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
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
      tr.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
      
      const dateStr = new Date(msg.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
      
      tr.innerHTML = `
        <td style="padding: 10px; font-weight: 500; font-size: 13px;">${msg.autor}</td>
        <td style="padding: 10px; font-size: 13px; word-break: break-word;">${msg.texto}</td>
        <td style="padding: 10px; font-size: 12px; color: var(--text-light);">${dateStr}</td>
        <td style="padding: 10px;">
          <button class="delete-msg-btn" data-id="${msg._id}" style="background: var(--slack-red); color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Eliminar
          </button>
        </td>
      `;
      adminMessagesTableBody.appendChild(tr);
    });
    
    // Listeners para eliminar mensajes
    document.querySelectorAll('.delete-msg-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
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

