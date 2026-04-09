const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

async function createPool() {
    const baseConfig = {
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    };

    if (process.env.NODE_ENV === 'production') {
        console.log('🔌 Conectando ao Aiven MySQL...');
        
        // Usar DATABASE_URL se disponível
        if (process.env.DATABASE_URL) {
            console.log('📡 Usando DATABASE_URL');
            pool = mysql.createPool({
                uri: process.env.DATABASE_URL,
                ...baseConfig
            });
        } else {
            // Fallback para variáveis individuais
            console.log('📡 Usando variáveis individuais');
            pool = mysql.createPool({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                ssl: { rejectUnauthorized: false }, // Ignora certificado para teste
                ...baseConfig
            });
        }
    } else {
        console.log('💻 Conectando ao MySQL local...');
        pool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'sistema_financeiro',
            ...baseConfig
        });
    }

    // Testar conexão
    try {
        const conn = await pool.getConnection();
        console.log('✅ Banco conectado!');
        conn.release();
    } catch (err) {
        console.error('❌ Erro na conexão:', err.message);
        throw err;
    }

    return pool;
}

// Inicializar
createPool().catch(console.error);

module.exports = pool;