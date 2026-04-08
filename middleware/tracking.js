const pool = require('../config/database');
const crypto = require('crypto');

// Fila de IPs para geolocalização
const geoQueue = new Map();
let processing = false;

// =====================================================
// FUNÇÃO PARA BUSCAR GEOLOCALIZAÇÃO
// =====================================================
async function fetchGeo(ip) {
    // Ignorar IPs locais
    if (ip === '127.0.0.1' || ip === '::1' || 
        ip.startsWith('192.168.') || ip.startsWith('10.') ||
        ip.startsWith('172.16.') || ip === 'localhost') {
        return { city: null, state: null, country: null };
    }
    
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country`);
        const data = await response.json();
        
        if (data.status === 'success') {
            return {
                city: data.city,
                state: data.regionName,
                country: data.country
            };
        }
        return { city: null, state: null, country: null };
    } catch (error) {
        console.error('❌ Erro na geolocalização:', error.message);
        return { city: null, state: null, country: null };
    }
}

// =====================================================
// PROCESSAR FILA EM LOTE
// =====================================================
async function processGeoQueue() {
    if (processing) return;
    processing = true;
    
    const batch = Array.from(geoQueue.entries());
    if (batch.length === 0) {
        processing = false;
        return;
    }
    
    console.log(`📍 Processando ${batch.length} IPs para geolocalização...`);
    
    for (const [visitorId, ip] of batch) {
        const geo = await fetchGeo(ip);
        await pool.query(
            'UPDATE visitors SET city = ?, state = ?, country = ? WHERE id = ?',
            [geo.city, geo.state, geo.country, visitorId]
        );
        geoQueue.delete(visitorId);
    }
    
    processing = false;
    
    // Agendar próxima execução (5 segundos)
    setTimeout(processGeoQueue, 5000);
}

// =====================================================
// ADICIONAR À FILA
// =====================================================
function queueGeoLookup(visitorId, ip) {
    if (!geoQueue.has(visitorId)) {
        geoQueue.set(visitorId, ip);
        processGeoQueue();
    }
}

// =====================================================
// ANALISAR USER AGENT
// =====================================================
function parseUserAgent(userAgent) {
    const ua = userAgent || '';
    const result = {
        browser: 'Desconhecido',
        browser_version: '',
        os: 'Desconhecido',
        os_version: '',
        device_type: 'desktop'
    };
    
    // Detectar navegador
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
        result.browser = 'Chrome';
        const match = ua.match(/Chrome\/(\d+)/);
        if (match) result.browser_version = match[1];
    } else if (ua.includes('Firefox')) {
        result.browser = 'Firefox';
        const match = ua.match(/Firefox\/(\d+)/);
        if (match) result.browser_version = match[1];
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        result.browser = 'Safari';
    } else if (ua.includes('Edg')) {
        result.browser = 'Edge';
    } else if (ua.includes('OPR')) {
        result.browser = 'Opera';
    }
    
    // Detectar SO
    if (ua.includes('Windows NT 10.0')) {
        result.os = 'Windows 10/11';
        result.os_version = '10+';
    } else if (ua.includes('Windows NT 6.1')) {
        result.os = 'Windows 7';
    } else if (ua.includes('Windows NT 6.2') || ua.includes('Windows NT 6.3')) {
        result.os = 'Windows 8/8.1';
    } else if (ua.includes('Mac OS X')) {
        result.os = 'macOS';
        const match = ua.match(/Mac OS X (\d+)[._](\d+)/);
        if (match) result.os_version = `${match[1]}.${match[2]}`;
    } else if (ua.includes('Android')) {
        result.os = 'Android';
        result.device_type = 'mobile';
        const match = ua.match(/Android (\d+)/);
        if (match) result.os_version = match[1];
    } else if (ua.includes('iPhone')) {
        result.os = 'iOS';
        result.device_type = 'mobile';
    } else if (ua.includes('iPad')) {
        result.os = 'iOS';
        result.device_type = 'tablet';
    } else if (ua.includes('Linux')) {
        result.os = 'Linux';
    }
    
    // Detectar tablet (Android que não é mobile)
    if (ua.includes('Android') && !ua.includes('Mobile')) {
        result.device_type = 'tablet';
    }
    
    return result;
}

// =====================================================
// MIDDLEWARE PRINCIPAL
// =====================================================
async function trackVisitor(req, res, next) {
    // Verificar consentimento
    const consent = req.cookies?.tracking_consent;
    
    if (consent !== 'accepted') {
        return next();
    }
    
    try {
        // Gerenciar sessão
        const sessionId = req.cookies?.visitor_session || 
            crypto.randomBytes(32).toString('hex');
        
        if (!req.cookies?.visitor_session) {
            res.cookie('visitor_session', sessionId, { 
                maxAge: 365 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
        }
        
        // Capturar IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                   req.socket.remoteAddress || 
                   '0.0.0.0';
        
        // Analisar User Agent
        const userAgent = req.headers['user-agent'] || '';
        const parsedUA = parseUserAgent(userAgent);
        
        // Buscar visitante existente
        const [existing] = await pool.query(
            'SELECT id, visit_count FROM visitors WHERE session_id = ?',
            [sessionId]
        );
        
        if (existing.length > 0) {
            // Atualizar visitante existente
            await pool.query(
                `UPDATE visitors 
                 SET last_visit = NOW(), 
                     visit_count = visit_count + 1,
                     referrer_url = COALESCE(?, referrer_url),
                     landing_page = COALESCE(?, landing_page)
                 WHERE id = ?`,
                [req.headers.referer || null, req.originalUrl, existing[0].id]
            );
            
            // Registrar página visitada
            await pool.query(
                `INSERT INTO visitor_pages (visitor_id, page_url, page_title, visited_at)
                 VALUES (?, ?, ?, NOW())`,
                [existing[0].id, req.originalUrl, req.headers['x-page-title'] || null]
            );
            
            req.visitorId = existing[0].id;
        } else {
            // Criar novo visitante
            const [result] = await pool.query(
                `INSERT INTO visitors 
                 (session_id, ip_address, user_agent, browser, browser_version, 
                  os, os_version, device_type, language, referrer_url, 
                  landing_page, first_visit, city, state, country)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NULL, NULL, NULL)`,
                [
                    sessionId, ip, userAgent, parsedUA.browser, parsedUA.browser_version,
                    parsedUA.os, parsedUA.os_version, parsedUA.device_type,
                    req.headers['accept-language']?.split(',')[0] || 'pt-BR',
                    req.headers.referer || null,
                    req.originalUrl
                ]
            );
            
            req.visitorId = result.insertId;
            
            // Adicionar à fila de geolocalização (processamento assíncrono)
            queueGeoLookup(result.insertId, ip);
        }
        
        next();
    } catch (error) {
        console.error('❌ Erro no tracking:', error);
        next();
    }
}

// =====================================================
// EXPORTAR FUNÇÕES
// =====================================================
module.exports = { 
    trackVisitor, 
    parseUserAgent, 
    queueGeoLookup,
    processGeoQueue
};