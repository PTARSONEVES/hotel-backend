const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;
let isReconnecting = false;

// Função para criar o pool
function createPool() {
    if (process.env.NODE_ENV === 'production') {
        console.log('🔌 Conectando ao Railway...');

        // Se tiver DATABASE_URL, usa ela
        if (process.env.DATABASE_URL) {
            return mysql.createPool({
                uri: process.env.DATABASE_URL,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
                idleTimeout: 60000,
                // Reconexão automática
                connectionLimit: 10,
                // Timeouts
                connectTimeout: 30000,
                acquireTimeout: 30000
            });
        } else {
            // Ou usa parâmetros separados
            return mysql.createPool({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
                idleTimeout: 60000,
                connectTimeout: 30000,
                acquireTimeout: 30000
            });
        }
    } else {
        // Desenvolvimento - MySQL local
        return mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: process.env.DB_PASSWORD || '',
            database: 'sistema_financeiro',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000
        });
    }
}

// Criar pool inicial
pool = createPool();

// Função para reconectar
async function reconnect() {
    if (isReconnecting) return;
    isReconnecting = true;

    console.log('🔄 Tentando reconectar ao banco...');

    try {
        // Fechar pool antigo se existir
        if (pool) {
            try {
                await pool.end();
            } catch (err) {
                console.log('Erro ao fechar pool antigo:', err.message);
            }
        }

        // Criar novo pool
        pool = createPool();

        // Testar nova conexão
        const conn = await pool.getConnection();
        console.log('✅ Pool reconectado com sucesso!');
        conn.release();

    } catch (error) {
        console.error('❌ Falha na reconexão:', error.message);
        // Tentar novamente em 30 segundos
        setTimeout(reconnect, 30000);
    } finally {
        isReconnecting = false;
    }
}

// Monitorar erros do pool
pool.on('error', async (err) => {
    console.error('❌ Erro no pool:', err.message);

    if (err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.fatal) {
        console.log('⚠️ Conexão perdida, tentando reconectar...');
        await reconnect();
    }
});

// Função para testar conexão (keep-alive)
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        console.log('💓 Keep-alive:', new Date().toLocaleTimeString());
        return true;
    } catch (error) {
        console.error('❌ Erro no keep-alive:', error.message);
        await reconnect();
        return false;
    }
}

// Testar conexão inicial
async function initialize() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Pool de conexões OK');
        connection.release();

        // Iniciar keep-alive (a cada 4 minutos)
        setInterval(testConnection, 4 * 60 * 1000);

    } catch (err) {
        console.error('❌ Erro na conexão inicial:', err.message);
        // Tentar reconectar após 5 segundos
        setTimeout(initialize, 5000);
    }
}

// Inicializar
initialize();

module.exports = pool;