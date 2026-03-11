const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    console.log('='.repeat(50));
    console.log('🔍 MIDDLEWARE DE AUTENTICAÇÃO');
    
    const authHeader = req.headers.authorization;
    console.log('📌 Auth header recebido:', authHeader);

    if (!authHeader) {
        console.log('❌ Erro: Nenhum header de autorização');
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    if (!authHeader.startsWith('Bearer ')) {
        console.log('❌ Erro: Formato inválido (deveria ser "Bearer token")');
        return res.status(401).json({ error: 'Formato de token inválido' });
    }

    const token = authHeader.split(' ')[1];
    console.log('📌 Token extraído:', token.substring(0, 20) + '...');

    try {
        console.log('📌 JWT_SECRET usado:', process.env.JWT_SECRET ? '******' : 'NÃO DEFINIDO');
       
        if (!process.env.JWT_SECRET) {
            console.log('❌ Erro: JWT_SECRET não está definido no .env');
            return res.status(500).json({ error: 'Erro de configuração do servidor' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token válido! Payload:', decoded);
        
        req.userId = decoded.id;
        next();
        
    } catch (error) {
        console.log('❌ Erro na verificação do token:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        
        return res.status(401).json({ error: 'Erro de autenticação' });
    }
};