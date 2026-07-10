document.addEventListener('DOMContentLoaded', () => {
    // Hamburger Menu (Mobile Placeholder logic)
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '70px';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.background = 'var(--glass-bg)';
            navLinks.style.backdropFilter = 'blur(10px)';
            navLinks.style.padding = '20px 0';
            navLinks.style.textAlign = 'center';
        });
    }

    // Chatbot Logic
    const chatToggle = document.getElementById('chatToggle');
    const chatClose = document.getElementById('chatClose');
    const chatContainer = document.getElementById('chatContainer');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    const chatMessages = document.getElementById('chatMessages');
    const quickActions = document.getElementById('quickActions');
    const quickBtns = document.querySelectorAll('.quick-btn');

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        chatContainer.classList.add('active');
        chatToggle.style.transform = 'scale(0)';
    });

    chatClose.addEventListener('click', () => {
        chatContainer.classList.remove('active');
        chatToggle.style.transform = 'scale(1)';
    });

    // Send Message
    const sendMessage = async (text) => {
        if (!text.trim()) return;

        // Add user message to UI
        addMessage(text, 'user-message');
        chatInput.value = '';

        // Hide quick actions once user starts chatting
        if (quickActions) {
            quickActions.style.display = 'none';
        }

        // Show typing indicator
        const typingId = showTypingIndicator();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: text })
            });

            removeTypingIndicator(typingId);

            if (!response.ok) {
                try {
                    const errData = await response.json();
                    addMessage(`Error del servidor: ${errData.error}`, 'bot-message');
                } catch (e) {
                    addMessage('Lo siento, el servidor no está respondiendo. Intenta de nuevo más tarde.', 'bot-message');
                }
                return;
            }

            const data = await response.json();
            addMessage(data.reply, 'bot-message');
        } catch (error) {
            console.error('Error:', error);
            removeTypingIndicator(typingId);
            addMessage('Hubo un error de conexión.', 'bot-message');
        }
    };

    // UI Helpers
    const formatMarkdown = (text) => {
        if (!text) return '';
        // Replace escaped or literal newlines
        let html = text.replace(/\\n/g, '\n');
        
        // Replace bold text: **text** -> <strong>text</strong>
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Convert bullet points (* or -) into line breaks with nice bullets
        html = html.replace(/(?:\s|^)\*\s/g, '<br>• ');
        html = html.replace(/(?:\s|^)-\s/g, '<br>• ');
        
        // Replace remaining newlines with <br>
        html = html.replace(/\n/g, '<br>');
        
        // Remove redundant leading line breaks
        html = html.replace(/^(<br>)+/, '');
        
        return html;
    };

    const addMessage = (text, className) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${className}`;
        msgDiv.innerHTML = className === 'bot-message' ? formatMarkdown(text) : text;
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    };

    const showTypingIndicator = () => {
        const id = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = id;
        typingDiv.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
        return id;
    };

    const removeTypingIndicator = (id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
    };

    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    // Event Listeners
    chatSend.addEventListener('click', () => {
        sendMessage(chatInput.value);
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage(chatInput.value);
        }
    });

    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.getAttribute('data-query');
            sendMessage(query);
        });
    });
});
