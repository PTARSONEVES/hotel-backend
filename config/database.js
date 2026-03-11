const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

if (process.env.NODE_ENV === 'production') {
    // Produção - Railway
    console.log('🔌 Conectando ao Railway...');
    
    // Se tiver DATABASE_URL, usa ela
    if (process.env.DATABASE_URL) {
        pool = mysql.createPool(process.env.DATABASE_URL);
    } else {
        // Ou usa parâmetros separados
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
    
    console.log('✅ Conectado ao Railway!');
} else {
    // Desenvolvimento - MySQL local
    pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'sistema_financeiro',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    
    console.log('💻 Conectado ao MySQL local');
}

// Testar conexão
pool.getConnection()
    .then(conn => {
        console.log('✅ Pool de conexões OK');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro no pool:', err);
    });

module.exports = pool;