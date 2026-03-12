const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');
const authMiddleware = require('../middleware/auth');

// Rotas públicas
router.post('/forgot', passwordController.forgotPassword);
router.get('/verify/:token', passwordController.verifyToken);
router.post('/reset', passwordController.resetPassword);
router.get('/test-email', passwordController.testEmail);
// Rota protegida (usuário logado)
router.post('/change', authMiddleware, passwordController.changePassword);

module.exports = router;