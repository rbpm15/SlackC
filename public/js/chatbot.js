'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const btnToggleChatbot = document.getElementById('btnToggleChatbot');
  const btnCloseChatbot = document.getElementById('btnCloseChatbot');
  const chatbotPanel = document.getElementById('chatbotPanel');
  const agendaPanel = document.getElementById('agendaPanel');

  function toggleChatbot() {
    const isChatbotVisible = chatbotPanel.style.display !== 'none';
    
    if (isChatbotVisible) {
      chatbotPanel.style.display = 'none';
      agendaPanel.style.display = 'flex';
    } else {
      chatbotPanel.style.display = 'flex';
      agendaPanel.style.display = 'none';
    }
  }

  if (btnToggleChatbot) {
    btnToggleChatbot.addEventListener('click', toggleChatbot);
  }

  if (btnCloseChatbot) {
    btnCloseChatbot.addEventListener('click', () => {
      chatbotPanel.style.display = 'none';
      agendaPanel.style.display = 'flex';
    });
  }

  const btnDMtoBot = document.getElementById('btnDMtoBot');
  const chatbotQuickInput = document.getElementById('chatbotQuickInput');
  
  async function sendQuickMessage() {
    const text = chatbotQuickInput ? chatbotQuickInput.value.trim() : '';
    if (!text) return;
    
    const historyEl = document.getElementById('chatbotHistory');
    
    // Add User message
    const userMsg = document.createElement('div');
    userMsg.style.cssText = "background: rgba(255,255,255,0.05); padding: 8px; border-radius: 6px; margin-left: 20px;";
    userMsg.innerHTML = `<strong>Tú:</strong> ${text}`;
    historyEl.appendChild(userMsg);
    historyEl.scrollTop = historyEl.scrollHeight;
    
    chatbotQuickInput.value = '';
    
    // Add thinking indicator
    const botMsg = document.createElement('div');
    botMsg.style.cssText = "background: rgba(54,197,240,0.1); padding: 8px; border-radius: 6px; margin-right: 20px;";
    botMsg.innerHTML = `<strong>SLC BOT:</strong> <em>Escribiendo...</em>`;
    historyEl.appendChild(botMsg);
    historyEl.scrollTop = historyEl.scrollHeight;

    try {
      const res = await fetch('/api/bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: text })
      });
      const data = await res.json();
      botMsg.innerHTML = `<strong>SLC BOT:</strong> ${data.respuesta || 'Error obteniendo respuesta.'}`;
    } catch (e) {
      botMsg.innerHTML = `<strong>SLC BOT:</strong> <em>Error de conexión.</em>`;
    }
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  if (btnDMtoBot) {
    btnDMtoBot.addEventListener('click', sendQuickMessage);
  }

  if (chatbotQuickInput) {
    chatbotQuickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendQuickMessage();
      }
    });
  }
});
