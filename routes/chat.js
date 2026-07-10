const express = require('express');
const router = express.Router();
const openRouterService = require('../services/openrouter');

router.post('/', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const reply = await openRouterService.getChatResponse(message);
        res.json({ reply });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

module.exports = router;
