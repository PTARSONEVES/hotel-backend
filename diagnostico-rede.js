const dns = require('dns');
const net = require('net');
require('dotenv').config({ path: '.env.production' });

const host = process.env.DB_HOST;
const port = parseInt(process.env.DB_PORT);

console.log('🔍 DIAGNÓSTICO DE REDE\n');
console.log('📌 Host:', host);
console.log('📌 Porta:', port);

// 1. Resolver DNS
console.log('\n📡 Resolvendo DNS...');
dns.lookup(host, (err, address, family) => {
    if (err) {
        console.log('❌ Erro DNS:', err.message);
    } else {
        console.log('✅ DNS resolvido:', address, '(IPv' + family + ')');
        
        // 2. Testar conexão TCP
        console.log('\n🔌 Testando conexão TCP...');
        const socket = net.createConnection({
            host: address,
            port: port,
            timeout: 10000
        });
        
        socket.on('connect', () => {
            console.log('✅ Conexão TCP estabelecida!');
            console.log('   O problema não é de rede - é na camada MySQL/SSL');
            socket.end();
        });
        
        socket.on('timeout', () => {
            console.log('❌ Timeout na conexão TCP');
            console.log('   🔧 Verifique firewall/porta bloqueada');
            socket.destroy();
        });
        
        socket.on('error', (err) => {
            console.log('❌ Erro TCP:', err.message);
            console.log('   🔧 Verifique se a porta está correta e liberada');
        });
    }
});

// 3. Verificar configuração do MySQL
console.log('\n⚙️ Verificações:');
console.log('1️⃣ No Aiven Console:');
console.log('   - Service está RUNNING?');
console.log('   - Allowed IPs configurado?');
console.log('2️⃣ No .env.production:');
console.log('   - DB_HOST está correto? (sem https://)');
console.log('   - DB_PORT é número?');
console.log('3️⃣ Sua rede:');
console.log('   - Está em VPN/proxy?');
console.log('   - Firewall bloqueia porta ' + port + '?');