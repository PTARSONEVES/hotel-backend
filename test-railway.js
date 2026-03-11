const mysql = require('mysql2/promise');

// Sua URL do Railway
const databaseUrl = 'mysql://root:doUDwYrDiCxmIAINYwziXgsKOTmghSRB@hopper.proxy.rlwy.net:48333/railway';

async function testRailway() {
    console.log('🔍 Testando conexão com Railway...');
    
    try {
        // Parse da URL
        const connection = await mysql.createConnection(databaseUrl);
        
        console.log('✅ Conectado ao Railway!');
        
        // Testar query
        const [result] = await connection.query('SELECT 1 as test');
        console.log('✅ Query funcionando:', result);
        
        // Listar databases
        const [databases] = await connection.query('SHOW DATABASES');
        console.log('📊 Databases:', databases);
        
        await connection.end();
        console.log('🎉 Tudo OK! Railway pronto para uso');
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

testRailway();