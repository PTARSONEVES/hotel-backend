// Configurações para produção
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

const setupProduction = (app) => {
    // Segurança
    app.use(helmet({
        contentSecurityPolicy: false,
    }));
    
    // Compressão
    app.use(compression());
    
    // Rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: 100 // limite por IP
    });
    app.use('/api', limiter);
    
    // Trust proxy (para o Render)
    app.set('trust proxy', 1);
    
    console.log('✅ Configurações de produção aplicadas');
};

module.exports = setupProduction;