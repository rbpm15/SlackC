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
  
  function sendQuickMessage() {
    const text = chatbotQuickInput ? chatbotQuickInput.value.trim() : '';
    
    // Switch to bot channel
    const slcBotItem = document.querySelector('.dm-item[data-channel-id="slcbot"]');
    if (slcBotItem) slcBotItem.click();

    // If there is text, put it in the main chat input and trigger send
    if (text) {
      setTimeout(() => {
        const chatInputEl = document.getElementById('chatInput');
        const sendBtnEl = document.getElementById('sendBtn');
        if (chatInputEl && sendBtnEl) {
          chatInputEl.value = text;
          sendBtnEl.disabled = false;
          sendBtnEl.click();
        }
      }, 100);
      chatbotQuickInput.value = '';
    }

    chatbotPanel.style.display = 'none';
    agendaPanel.style.display = 'flex';
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
