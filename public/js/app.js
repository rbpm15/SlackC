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
    
    // Tooltip Elements
    const chatTooltip = document.getElementById('chatTooltip');
    const tooltipClose = document.getElementById('tooltipClose');

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        chatContainer.classList.add('active');
        chatToggle.style.transform = 'scale(0)';
        if (chatTooltip) {
            chatTooltip.style.display = 'none';
        }
    });

    chatClose.addEventListener('click', () => {
        chatContainer.classList.remove('active');
        chatToggle.style.transform = 'scale(1)';
    });

    // Tooltip interaction
    if (chatTooltip) {
        chatTooltip.style.cursor = 'pointer'; // Make it clear it is clickable
        chatTooltip.addEventListener('click', () => {
            chatContainer.classList.add('active');
            chatToggle.style.transform = 'scale(0)';
            chatTooltip.style.display = 'none';
        });
    }

    if (tooltipClose && chatTooltip) {
        tooltipClose.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the chat when closing the tooltip
            chatTooltip.style.display = 'none';
        });
    }

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

    // Modal de Registro Logic
    const registrationModal = document.getElementById('registrationModal');
    const modalClose = document.getElementById('modalClose');
    const registrationForm = document.getElementById('registrationForm');
    const modalSuccess = document.getElementById('modalSuccess');
    const regPlan = document.getElementById('regPlan');
    const selectedPlanInput = document.getElementById('selectedPlanInput');
    const choosePlanBtns = document.querySelectorAll('.plan-card button');

    if (choosePlanBtns && registrationModal) {
        choosePlanBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const planCard = btn.closest('.plan-card');
                const planName = planCard.querySelector('h3').textContent;
                
                // Show form, hide success message, clear form fields first
                registrationForm.style.display = 'block';
                modalSuccess.classList.remove('active');
                registrationForm.reset();

                // Then pre-populate plan in the modal form
                regPlan.value = planName;
                selectedPlanInput.value = planName;
                
                // Show modal
                registrationModal.classList.add('active');
            });
        });
    }

    if (modalClose && registrationModal) {
        modalClose.addEventListener('click', () => {
            registrationModal.classList.remove('active');
        });
        
        // Close modal on click outside modal-content
        registrationModal.addEventListener('click', (e) => {
            if (e.target === registrationModal) {
                registrationModal.classList.remove('active');
            }
        });
    }

    if (registrationForm && modalSuccess) {
        registrationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Gather input values
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const phone = document.getElementById('regPhone').value;
            const plan = selectedPlanInput.value;
            
            console.log("Registro recibido:", { name, email, phone, plan });
            
            // Hide form and show success message
            registrationForm.style.display = 'none';
            modalSuccess.classList.add('active');
            
            // Auto close after 3 seconds
            setTimeout(() => {
                registrationModal.classList.remove('active');
            }, 3000);
        });
    }
});
