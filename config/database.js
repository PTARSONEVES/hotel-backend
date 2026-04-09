const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

// Função para criar pool
function createPool() {
    const baseConfig = {
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    };

    if (process.env.NODE_ENV === 'production') {
        console.log('🔌 Conectando ao Aiven MySQL...');

        // Configuração para Aiven (requer SSL)
        const config = {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: {
                rejectUnauthorized: true,
                ca: process.env.DB_CA_CERT
            },
            ...baseConfig
        };

        console.log(`📡 Host: ${config.host}:${config.port}`);
        console.log(`📡 Database: ${config.database}`);
        console.log(`📡 User: ${config.user}`);
        
        return mysql.createPool(config);
    } else {
        console.log('💻 Conectando ao MySQL local...');
        return mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'sistema_financeiro',
            ...baseConfig
        });
    }
}

pool = createPool();

// Testar conexão
pool.getConnection()
    .then(conn => {
        console.log('✅ Pool de conexões OK');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro no pool:', err.message);
        console.error('Detalhes:', err);
    });

module.exports = pool;