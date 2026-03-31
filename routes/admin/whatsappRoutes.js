const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

router.use(authMiddleware);
router.use(authorize.minimumRole('colaborador'));

// Listar mensagens do WhatsApp
router.get('/messages', async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;
        
        let query = 'SELECT * FROM whatsapp_messages WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (startDate) {
            query += ' AND DATE(created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY created_at DESC LIMIT 100';
        
        const [messages] = await pool.query(query, params);
        res.json(messages);
    } catch (error) {
        console.error('Erro ao listar mensagens:', error);
        res.status(500).json({ error: 'Erro ao listar mensagens' });
    }
});

// Marcar mensagem como respondida
router.put('/messages/:id/replied', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(
            'UPDATE whatsapp_messages SET status = "replied" WHERE id = ?',
            [id]
        );
        
        res.json({ message: 'Mensagem marcada como respondida' });
    } catch (error) {
        console.error('Erro ao marcar mensagem:', error);
        res.status(500).json({ error: 'Erro ao marcar mensagem' });
    }
});

module.exports = router;