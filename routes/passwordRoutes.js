const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');
const authMiddleware = require('../middleware/auth');

// =====================================================
// ROTAS DE TESTE
// =====================================================
router.get('/test-sendgrid', passwordController.testSendGrid);

// =====================================================
// ROTAS PÚBLICAS
// =====================================================
router.post('/forgot', passwordController.forgotPassword);
router.get('/verify/:token', passwordController.verifyToken);
router.post('/reset', passwordController.resetPassword);

// =====================================================
// ROTA PROTEGIDA
// =====================================================
router.post('/change', authMiddleware, passwordController.changePassword);

module.exports = router;