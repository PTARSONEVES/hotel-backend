// backend/config/database.js
const mysql = require('mysql2/promise');

let pool;

async function initializePool() {
    const baseConfig = {
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    };

    // PRIORIDADE TOTAL para a DATABASE_URL no ambiente de produção
    if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
        console.log('🚀 Conectando ao banco de dados de PRODUÇÃO via DATABASE_URL');
        pool = mysql.createPool({
            uri: process.env.DATABASE_URL,
            ...baseConfig
        });
    }
    // Fallback para desenvolvimento local (opcional, mas útil)
    else if (process.env.NODE_ENV !== 'production') {
        console.log('💻 Conectando ao banco de dados de DESENVOLVIMENTO (localhost)');
        pool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'sistema_financeiro',
            ...baseConfig
        });
    }
    else {
        // Caso a DATABASE_URL não seja encontrada em produção, lança um erro claro.
        console.error('❌ ERRO CRÍTICO: Variável DATABASE_URL não encontrada no ambiente de produção!');
        throw new Error('DATABASE_URL is not defined');
    }

    // Teste de conexão inicial
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
        connection.release();
    } catch (err) {
        console.error('❌ Falha na conexão inicial com o banco de dados:', err.message);
        // Não derrube o app, mas registre o erro. A primeira requisição falhará.
    }
    return pool;
}

// Inicializa o pool e o exporta
const initializingPool = initializePool();
module.exports = initializingPool;