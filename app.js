const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Configuração CORS
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.ancorarportodegalinhas.com',
    'https://ancorarportodegalinhas.com',
    'https://hotel-frontend-xi-five.vercel.app',
    'https://sistema-hotel-api.onrender.com'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            console.log('🚫 Bloqueado:', origin);
            return callback(new Error('CORS bloqueado'), false);
        }
        console.log('✅ Permitido:', origin);
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(express.json());
app.use(cookieParser());

// =====================================================
// MIDDLEWARE DE RASTREAMENTO
// =====================================================
const { trackVisitor } = require('./middleware/tracking');
app.use(trackVisitor);

// =====================================================
// ROTAS PÚBLICAS
// =====================================================
const visitorRoutes = require('./routes/admin/visitorRoutes');
const publicRoutes = require('./routes/publicRoutes');


// Rota de teste de tracking
app.get('/api/visitors/test-status', (req, res) => {
    const consent = req.cookies?.tracking_consent;
    const sessionId = req.cookies?.visitor_session;

    res.json({
        success: true,
        tracking_active: consent === 'accepted',
        consent_cookie: consent || 'não definido',
        session_id: sessionId || 'não definido',
        ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
        user_agent: req.headers['user-agent'],
        message: 'Rota de teste funcionando!'
    });
});


app.use('/api/public', publicRoutes);
app.use('/api/visitors', visitorRoutes);

// =====================================================
// ROTAS PROTEGIDAS
// =====================================================
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const hotelRoutes = require('./modules/hotel/routes/hotelRoutes');
const adminLeadRoutes = require('./routes/admin/leadRoutes');
const userRoutes = require('./routes/admin/userRoutes');
const financialRoutes = require('./routes/financialRoutes');
const maintenanceRoutes = require('./modules/maintenance/routes/maintenanceRoutes');
const chatbotController = require('./controllers/chatbotController');

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hotel', hotelRoutes);
app.use('/api/admin', adminLeadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/maintenance', maintenanceRoutes);

// Rota do chatbot
app.post('/api/chatbot/message', chatbotController.processMessage);
app.post('/api/chatbot/feedback', chatbotController.saveFeedback);

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando!',
        cors: allowedOrigins 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Iniciar cron jobs
require('./cron/alerts');