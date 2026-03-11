const jwt = require('jsonwebtoken');
require('dotenv').config();

console.log('🔍 TESTE DE JWT');
console.log('='.repeat(50));

// Verificar JWT_SECRET
console.log('📌 JWT_SECRET:', process.env.JWT_SECRET ? '✅ Definido' : '❌ NÃO DEFINIDO');

if (!process.env.JWT_SECRET) {
    console.log('❌ ERRO: JWT_SECRET não está definido no arquivo .env');
    process.exit(1);
}

// Criar token de teste
const payload = { id: 1, email: 'teste@teste.com' };
console.log('\n📌 Criando token de teste...');

const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
console.log('✅ Token criado:', token);

// Verificar token
console.log('\n📌 Verificando token...');
try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token válido! Payload:', decoded);
} catch (error) {
    console.log('❌ Erro na verificação:', error.message);
}

// Testar com token inválido
console.log('\n📌 Testando token inválido...');
try {
    jwt.verify(token + 'invalido', process.env.JWT_SECRET);
} catch (error) {
    console.log('✅ Capturou erro esperado:', error.message);
}

console.log('\n🔧 Se o teste acima funcionou, o problema está no token do frontend');
console.log('🔧 Se falhou, verifique o JWT_SECRET no arquivo .env');