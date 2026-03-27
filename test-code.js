const { generateOperationCode, parseOperationCode, listOperationTypes } = require('./utils/codeGenerator');
const pool = require('./config/database');

async function test() {
    try {
        console.log('🔍 Testando gerador de códigos...\n');
        
        // Listar tipos de operação
        const types = await listOperationTypes();
        console.log('📋 Tipos de operação disponíveis:');
        types.forEach(t => console.log(`   ${t.code}: ${t.name} (${t.table_name})`));
        
        console.log('\n📝 Gerando código para hóspede...');
        const code = await generateOperationCode('guests');
        console.log('   Código gerado:', code);
        
        console.log('\n🔍 Analisando código...');
        const parsed = await parseOperationCode(code.code);
        console.log('   Análise:', parsed);
        
        console.log('\n✅ Teste concluído!');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        await pool.end();
    }
}

test();