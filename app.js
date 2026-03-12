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
    'https://seu-frontend.vercel.app', // Substitua pelo seu domínio
    'https://sistema-hotel-api.onrender.com'
]

// Configuração CORS mais permissiva para desenvolvimento
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

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