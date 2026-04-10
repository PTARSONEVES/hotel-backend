const pool = require('./config/database');

async function test() {
    try {
        console.log('🔍 Testando conexão com Aiven...');
        const [result] = await pool.query('SELECT 1 as test');
        console.log('✅ Query OK:', result);
        
        const [tables] = await pool.query('SHOW TABLES');
        console.log('📊 Tabelas:', tables.map(t => Object.values(t)[0]));
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

test();