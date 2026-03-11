const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

if (process.env.NODE_ENV === 'production') {
    // Produção - Aiven (MySQL)
    pool = mysql.createPool({
        host: process.env.DB_HOSTPROD,
        port: process.env.DB_PORTPROD || 12345,
        user: process.env.DB_USERPROD || 'avnadmin',
        password: process.env.DB_PASSWORDPROD,
        database: process.env.DB_NAMEPROD || 'defaultdb',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        ssl: {
            rejectUnauthorized: true,
            ca: process.env.DB_CA_CERT // opcional, Aiven aceita sem
        },
        // Importante para evitar desconexões no plano gratuito
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    });
    console.log('🔌 Conectando ao Aiven MySQL em produção...');
} else {
    // Desenvolvimento - MySQL local
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD|| '',
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log('💻 Conectando ao MySQL local (desenvolvimento)...');
}

module.exports = pool;
