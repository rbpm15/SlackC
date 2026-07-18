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
});
