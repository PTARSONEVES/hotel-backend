const express = require('express');
const cors = require('cors');
const path = require('path');
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


// =====================================================
// SUAS ROTAS EXISTENTES
// =====================================================
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const hotelRoutes = require('./modules/hotel/routes/hotelRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminLeadRoutes = require('./routes/admin/leadRoutes');
const userRoutes = require('./routes/admin/userRoutes');

// Rotas públicas (ANTES do middleware de autenticação)
app.use('/api/public', publicRoutes);
// Rotas protegidas
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/hotel', hotelRoutes);
// Rotas de admin
app.use('/api/admin', adminLeadRoutes);
app.use('/api/users', userRoutes);
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
});// Forçando rebuild no Render - 03/13/2026 16:08:41

// Iniciar cron jobs
require('./cron/alerts');