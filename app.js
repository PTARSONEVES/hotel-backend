const express = require('express');
const cors = require('cors');
const path = require('path');
const chatbotController = require('./controllers/chatbotController');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Configuração CORS (já existente)
const allowedOrigins = [
    'http://localhost:5173',
    'https://www.ancorarportodegalinhas.com',
    'https://ancorarportodegalinhas.com',
    'https://hotel-frontend-xi-five.vercel.app',
    'https://sistema-hotel-api.onrender.com'
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// =====================================================
// MIDDLEWARE DE RASTREAMENTO
// =====================================================
const { trackVisitor } = require('./middleware/tracking');
app.use(trackVisitor);

// =====================================================
// SUAS ROTAS EXISTENTES
// =====================================================
const visitorRoutes = require('./routes/admin/visitorRoutes');
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const hotelRoutes = require('./modules/hotel/routes/hotelRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminLeadRoutes = require('./routes/admin/leadRoutes');
const userRoutes = require('./routes/admin/userRoutes');
const financialRoutes = require('./routes/financialRoutes');
const maintenanceRoutes = require('./modules/maintenance/routes/maintenanceRoutes');

app.use(trackVisitor);
// Rotas públicas (ANTES do middleware de autenticação)
app.use('/api/public', publicRoutes);
app.use('/api/visitors', visitorRoutes);  // Rota pública para teste
// Rotas protegidas
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hotel', hotelRoutes);
// Rotas de admin
app.use('/api/admin', adminLeadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/admin/visitors', visitorRoutes);
// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando!',
        cors: allowedOrigins 
    });
});
// Rota do chatbot
app.post('/api/chatbot/message', chatbotController.processMessage);
app.post('/api/chatbot/feedback', chatbotController.saveFeedback);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});// Forçando rebuild no Render - 03/13/2026 16:08:41

// Iniciar cron jobs
require('./cron/alerts');