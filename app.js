const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
// Importar módulo do hotel
const hotelRoutes = require('./modules/hotel/routes/hotelRoutes');

const app = express();

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://hotel-frontend-xi-five.vercel.app', // Substitua pelo seu domínio
    'https://sistema-hotel-api.onrender.com',
    process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined

console.log('🔧 CORS permitido para:', allowedOrigins);

// Configuração CORS mais permissiva para desenvolvimento
app.use(cors({
    origin: function(origin, callback) {
        // Permitir requisições sem origin (como apps mobile)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política CORS para este site não permite acesso da origem: ' + origin;
            console.log('🚫 Bloqueado:', origin);
            return callback(new Error(msg), false);
        }
        console.log('✅ Permitido:', origin);
        return callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());

// Rota de teste
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando!',
        cors: allowedOrigins 
    });
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/hotel', hotelRoutes);
// Rota de teste
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor funcionando!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});