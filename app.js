const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Configuração CORS (já existente)
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://hotel-frontend-xi-five.vercel.app',
    'https://sistema-hotel-api.onrender.com'
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

// =====================================================
// ROTA DE TESTE DIRETA (SEM DEPENDER DE OUTROS ARQUIVOS)
// =====================================================
app.get('/api/password/test-email', async (req, res) => {
    try {
        console.log('📧 Rota de teste acessada!');
        console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
        console.log('📧 EMAIL_PASS definida:', process.env.EMAIL_PASS ? 'Sim' : 'Não');
        
        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Envia para si mesmo
            subject: 'Teste Direto - Sistema Financeiro',
            text: 'Se você recebeu este email, a configuração está funcionando!',
            html: '<h1>Teste Direto</h1><p>Configuração de email OK!</p>'
        });

        console.log('✅ Email enviado! ID:', info.messageId);
        res.json({ 
            success: true, 
            message: 'Email enviado com sucesso!',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('❌ Erro detalhado:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code,
            response: error.response
        });
    }
});

// =====================================================
// SUAS ROTAS EXISTENTES
// =====================================================
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const hotelRoutes = require('./modules/hotel/routes/hotelRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hotel', hotelRoutes);

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando!',
        cors: allowedOrigins 
    });
});

// Rota ping (já existente)
app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});