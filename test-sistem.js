const pool = require('./config/database');

async function testSystem() {
    console.log('🔍 Testando sistema completo...');
    
    try {
        // 1. Testar usuários
        const [users] = await pool.query('SELECT COUNT(*) as total FROM users');
        console.log('✅ Usuários:', users[0].total);
        
        // 2. Testar apartamentos
        const [rooms] = await pool.query('SELECT COUNT(*) as total FROM rooms');
        console.log('✅ Apartamentos:', rooms[0].total);
        
        // 3. Testar tipos
        const [types] = await pool.query('SELECT COUNT(*) as total FROM room_types');
        console.log('✅ Tipos de apto:', types[0].total);
        
        console.log('🎉 Sistema funcionando no Railway!');
        
    } catch (error) {
        console.error('❌ Erro:', error);
    } finally {
        await pool.end();
    }
}

testSystem();