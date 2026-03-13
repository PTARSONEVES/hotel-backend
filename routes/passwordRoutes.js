const express = require('express');
const router = express.Router();
const passwordController = require('../controllers/passwordController');
const authMiddleware = require('../middleware/auth');

// Rota de teste de email (remova depois)
router.get('/test-email', async (req, res) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: 'seu-email@gmail.com', // Coloque seu email aqui para teste
            subject: 'Teste de Configuração',
            text: 'Se você recebeu este email, a configuração está funcionando!'
        });

        res.json({ message: '✅ Email enviado com sucesso!' });
    } catch (error) {
        console.error('❌ Erro detalhado:', error);
        res.status(500).json({ 
            error: error.message,
            code: error.code,
            command: error.command
        });
    }
});

// Rotas públicas
router.post('/forgot', passwordController.forgotPassword);
router.get('/verify/:token', passwordController.verifyToken);
router.post('/reset', passwordController.resetPassword);
// Rota protegida (usuário logado)
router.post('/change', authMiddleware, passwordController.changePassword);



module.exports = router;