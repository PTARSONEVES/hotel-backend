const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Rota de teste (remova depois)
router.get('/test-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const [users] = await pool.query(
            `SELECT id, email, verification_token, verification_expires_at, email_verified 
             FROM users 
             WHERE verification_token = ?`,
            [token]
        );
        
        if (users.length === 0) {
            return res.json({ success: false, message: 'Token não encontrado' });
        }
        
        const user = users[0];
        const now = new Date();
        const expiresAt = new Date(user.verification_expires_at);
        
        res.json({
            success: true,
            user: {
                email: user.email,
                token_banco: user.verification_token,
                expires_at: expiresAt,
                now: now,
                is_expired: now > expiresAt,
                is_verified: user.email_verified
            }
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

router.post('/register',
    [
        body('name').notEmpty().withMessage('Nome é obrigatório'),
        body('email').isEmail().withMessage('Email inválido'),
        body('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
    ],
    authController.register
);

router.post('/login',
    [
        body('email').isEmail().withMessage('Email inválido'),
        body('password').notEmpty().withMessage('Senha é obrigatória')
    ],
    authController.login
);

router.get('/confirm-email/:token', authController.confirmEmail);
router.post('/resend-verification', authController.resendVerification);

module.exports = router;