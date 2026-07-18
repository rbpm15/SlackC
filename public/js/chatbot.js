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
});
