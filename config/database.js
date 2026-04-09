const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let initializing = false;

const baseConfig = {
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

async function initializePool() {
    if (pool) return pool;
    if (initializing) {
        // Aguardar inicialização em andamento
        while (!pool) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return pool;
    }
    
    initializing = true;
    
    try {
        if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
            console.log('🚀 Conectando ao banco de dados de PRODUÇÃO');
            
            let cleanUrl = process.env.DATABASE_URL;
            cleanUrl = cleanUrl.replace(/\?ssl-mode=REQUIRED/, '?ssl=true');
            cleanUrl = cleanUrl.replace(/&ssl-mode=REQUIRED/, '&ssl=true');
            
            pool = mysql.createPool({
                uri: cleanUrl,
                ssl: { rejectUnauthorized: false },
                ...baseConfig
            });
        } 
        else if (process.env.NODE_ENV !== 'production') {
            console.log('💻 Conectando ao MySQL local');
            pool = mysql.createPool({
                host: 'localhost',
                user: 'root',
                password: process.env.DB_PASSWORD || '',
                database: 'sistema_financeiro',
                ...baseConfig
            });
        } 
        else {
            throw new Error('DATABASE_URL is not defined');
        }

        // Testar conexão
        const connection = await pool.getConnection();
        console.log('✅ Banco conectado!');
        connection.release();
        
    } catch (error) {
        console.error('❌ Erro na conexão:', error.message);
        throw error;
    } finally {
        initializing = false;
    }
    
    return pool;
}

// Inicializar imediatamente
initializePool().catch(console.error);

// Exportar um objeto que tem as mesmas propriedades do pool
// Isso permite que os controllers existentes continuem funcionando!
module.exports = new Proxy({}, {
    get: function(target, prop) {
        // Retornar uma função que aguarda o pool e então executa o método
        return async function(...args) {
            const db = await initializePool();
            if (typeof db[prop] === 'function') {
                return db[prop](...args);
            }
            return db[prop];
        };
    }
});