const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.production' });

async function testAiven() {
    console.log('🔍 Testando conexão com Aiven...');
    console.log('📌 Host:', process.env.DB_HOST);
    console.log('📌 Port:', process.env.DB_PORT);
    console.log('📌 User:', process.env.DB_USER);
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'defaultdb',
            ssl: { rejectUnauthorized: false } // Aiven aceita sem CA
        });
        
        console.log('✅ Conectado ao Aiven!');
        
        // Criar banco de dados se não existir
        await connection.query('CREATE DATABASE IF NOT EXISTS sistema_financeiro');
        console.log('✅ Banco de dados verificado/criado');
        
        // Usar o banco
        await connection.query('USE sistema_financeiro');
        
        // Testar query
        const [result] = await connection.query('SELECT 1 as test');
        console.log('✅ Query funcionando:', result);
        
        await connection.end();
        console.log('🎉 Tudo OK! Banco pronto para uso');
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('🔧 Dica: Verifique se host e porta estão corretos');
        }
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('🔧 Dica: Verifique usuário e senha');
        }
    }
}

testAiven();