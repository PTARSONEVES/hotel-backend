const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config({ path: '.env.production' });

async function migrate() {
    console.log('🚀 Iniciando migração para Railway...');
    
    let connection;
    try {
        // Conectar ao Railway
        if (process.env.DATABASE_URL) {
            connection = await mysql.createConnection(process.env.DATABASE_URL);
        } else {
            connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                port: parseInt(process.env.DB_PORT),
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                multipleStatements: true
            });
        }
        
        console.log('✅ Conectado ao Railway');
        
        // Ler arquivo SQL
        const sql = fs.readFileSync('./database.sql', 'utf8');
        
        // Dividir em comandos
        const commands = sql.split(';').filter(cmd => cmd.trim());
        
        console.log(`📦 Executando ${commands.length} comandos SQL...`);
        
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i].trim();
            if (cmd) {
                try {
                    await connection.query(cmd);
                    console.log(`✅ Comando ${i+1}/${commands.length} executado`);
                } catch (cmdError) {
                    // Ignora erros de tabelas já existentes
                    if (!cmdError.message.includes('already exists')) {
                        console.log(`⚠️ Comando ${i+1}:`, cmdError.message);
                    }
                }
            }
        }
        
        console.log('🎉 Migração concluída!');
        
        // Verificar tabelas
        const [tables] = await connection.query('SHOW TABLES');
        console.log('\n📊 Tabelas criadas:');
        tables.forEach(table => {
            console.log(`   - ${Object.values(table)[0]}`);
        });
        
    } catch (error) {
        console.error('❌ Erro na migração:', error);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();