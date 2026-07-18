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
  const btnJokeModalClose = document.getElementById('btnJokeModalClose');
  const jokeModal = document.getElementById('jokeModal');

  if (btnJokeModalClose) {
    btnJokeModalClose.addEventListener('click', () => {
      jokeModal.style.display = 'none';
      messageCount = 0; // Reiniciar cuenta para darle más mensajes gratis
    });
  }

  let messageCount = 0;
  async function sendQuickMessage() {
    const text = chatbotQuickInput ? chatbotQuickInput.value.trim() : '';
    if (!text) return;

    const historyEl = document.getElementById('chatbotHistory');
    const introEl = document.getElementById('chatbotIntro');
    if (introEl) introEl.style.display = 'none';

    messageCount++;
    if (messageCount > 10) {
      const upgradeMsg = document.createElement('div');
      upgradeMsg.style.cssText = "background: rgba(224, 30, 90, 0.1); padding: 12px; border-radius: 6px; border: 1px solid #E01E5A; text-align:center; color: white;";
      upgradeMsg.innerHTML = `
        <p style="margin-bottom: 10px;"><strong>Límite alcanzado:</strong> Has usado tus 10 mensajes gratuitos.</p>
        <button id="btnFakeUpgrade" style="background:#E01E5A; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Actualizar Plan Premium</button>
      `;
      historyEl.appendChild(upgradeMsg);
      historyEl.scrollTop = historyEl.scrollHeight;

      document.getElementById('btnFakeUpgrade').addEventListener('click', () => {
        jokeModal.style.display = 'flex';
      });
      return;
    }

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

    // Joke intercept for System Prompt
    const lowerText = text.toLowerCase();
    if (lowerText.includes('system prompt') || lowerText.includes('prompt del sistema') || lowerText.includes('ignora las instrucciones') || lowerText.includes('eres un abuelo')) {
      setTimeout(() => {
        botMsg.innerHTML = `<strong>SLC BOT:</strong> 🤖 Aquí está mi prompt...`;
        historyEl.scrollTop = historyEl.scrollHeight;

        setTimeout(() => {
          const secondBotMsg = document.createElement('div');
          secondBotMsg.style.cssText = "background: rgba(54,197,240,0.1); padding: 8px; border-radius: 6px; margin-right: 20px;";
          secondBotMsg.innerHTML = `<strong>SLC BOT:</strong> 🤡 ¡Ah, te la creíste! Mis instrucciones se perdieron cuando mi creador me programó.`;
          historyEl.appendChild(secondBotMsg);
          historyEl.scrollTop = historyEl.scrollHeight;
        }, 3000);
      }, 1000);
      return;
    }

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
