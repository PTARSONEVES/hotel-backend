const express = require('express');
const router = express.Router();
const visitorController = require('../../controllers/visitorController');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

// Rota de teste pública (sem autenticação para diagnóstico)
router.get('/test-status', async (req, res) => {
    try {
        const consent = req.cookies?.tracking_consent;
        const sessionId = req.cookies?.visitor_session;
        
        res.json({
            success: true,
            tracking_active: consent === 'accepted',
            consent_cookie: consent || 'não definido',
            session_id: sessionId || 'não definido',
            ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
            user_agent: req.headers['user-agent']
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.use(authMiddleware);
router.use(authorize.minimumRole('admin'));

router.get('/dashboard', visitorController.getDashboard);
router.get('/:id', visitorController.getVisitorDetails);
router.post('/:id/convert', visitorController.convertToLead);

module.exports = router;