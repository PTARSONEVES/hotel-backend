const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST, // Ex: 'mysql-xxxx.aivencloud.com'
    port: process.env.DB_PORT, // Ex: 12345
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        // Caminho para o arquivo ca.pem que você baixou do Aiven
        ca: process.env.DB_CA_CERT
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;