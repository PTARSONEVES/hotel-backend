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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token válido! Payload:', decoded);
        
        // IMPORTANTE: definir req.user com os dados completos
        req.userId = decoded.id;
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role || 'hospede'
        };
        
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