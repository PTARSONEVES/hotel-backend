const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

function createPool() {
    if (process.env.NODE_ENV === 'production') {
        console.log('🔌 Conectando ao Railway...');

        if (process.env.DATABASE_URL) {
            pool = mysql.createPool(process.env.DATABASE_URL);
        } else {
            pool = mysql.createPool({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 5,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000
            });
        }
    } else {
        pool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'sistema_financeiro',
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        });
    }
    
    return pool;
}

pool = createPool();

// Teste inicial
pool.getConnection()
    .then(conn => {
        console.log('✅ Banco conectado');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro no banco:', err.message);
    });

// Reconexão automática simples
setInterval(async () => {
    try {
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        console.log('💓 Keep-alive');
    } catch (err) {
        console.error('❌ Conexão perdida, recriando pool...');
        pool = createPool();
    }
}, 4 * 60 * 1000);

module.exports = pool;