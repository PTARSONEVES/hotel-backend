const pool = require('../config/database');

// =====================================================
// DASHBOARD DE VISITANTES
// =====================================================
exports.getDashboard = async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        
        // Determinar intervalo
        let interval = '30 DAY';
        if (period === '7d') interval = '7 DAY';
        if (period === '30d') interval = '30 DAY';
        if (period === '90d') interval = '90 DAY';
        
        // Total de visitantes
        const [total] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT session_id) as unique_visitors,
                SUM(visit_count) as total_visits
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
        `);
        
        // Visitantes por dia
        const [daily] = await pool.query(`
            SELECT 
                DATE(first_visit) as date,
                COUNT(*) as new_visitors,
                SUM(visit_count) as visits
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY DATE(first_visit)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        // Por dispositivo
        const [byDevice] = await pool.query(`
            SELECT 
                device_type,
                COUNT(*) as total
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY device_type
        `);
        
        // Por navegador
        const [byBrowser] = await pool.query(`
            SELECT 
                browser,
                COUNT(*) as total
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY browser
            ORDER BY total DESC
            LIMIT 10
        `);
        
        // Por SO
        const [byOS] = await pool.query(`
            SELECT 
                os,
                COUNT(*) as total
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY os
            ORDER BY total DESC
            LIMIT 10
        `);
        
        // Por país
        const [byCountry] = await pool.query(`
            SELECT 
                COALESCE(country, 'Desconhecido') as country,
                COUNT(*) as total
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY country
            ORDER BY total DESC
            LIMIT 20
        `);
        
        // Por origem (referrer)
        const [byReferrer] = await pool.query(`
            SELECT 
                CASE 
                    WHEN referrer_url LIKE '%google%' THEN 'Google'
                    WHEN referrer_url LIKE '%facebook%' THEN 'Facebook'
                    WHEN referrer_url LIKE '%instagram%' THEN 'Instagram'
                    WHEN referrer_url LIKE '%bing%' THEN 'Bing'
                    WHEN referrer_url LIKE '%yahoo%' THEN 'Yahoo'
                    WHEN referrer_url IS NULL THEN 'Direto'
                    ELSE 'Outros'
                END as source,
                COUNT(*) as total
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY source
            ORDER BY total DESC
        `);
        
        // Páginas mais visitadas
        const [topPages] = await pool.query(`
            SELECT 
                page_url,
                COUNT(*) as views,
                COUNT(DISTINCT visitor_id) as unique_visitors
            FROM visitor_pages
            WHERE visited_at >= DATE_SUB(NOW(), INTERVAL ${interval})
            GROUP BY page_url
            ORDER BY views DESC
            LIMIT 20
        `);
        
        // Últimos visitantes
        const [recent] = await pool.query(`
            SELECT 
                v.id,
                v.session_id,
                v.browser,
                v.os,
                v.device_type,
                v.city,
                v.state,
                v.country,
                v.visit_count,
                v.first_visit,
                v.last_visit,
                v.referrer_url,
                (SELECT page_url FROM visitor_pages WHERE visitor_id = v.id ORDER BY visited_at DESC LIMIT 1) as last_page
            FROM visitors v
            WHERE v.first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
            ORDER BY v.last_visit DESC
            LIMIT 50
        `);
        
        // Taxa de conversão (visitante → lead)
        const [conversion] = await pool.query(`
            SELECT 
                COUNT(*) as total_visitors,
                SUM(CASE WHEN converted = TRUE THEN 1 ELSE 0 END) as converted,
                ROUND(SUM(CASE WHEN converted = TRUE THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as conversion_rate
            FROM visitors
            WHERE first_visit >= DATE_SUB(NOW(), INTERVAL ${interval})
        `);
        
        res.json({
            summary: total[0],
            daily,
            byDevice,
            byBrowser,
            byOS,
            byCountry,
            byReferrer,
            topPages,
            recent,
            conversion: conversion[0]
        });
        
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
};

// =====================================================
// DETALHES DO VISITANTE
// =====================================================
exports.getVisitorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [visitors] = await pool.query(`
            SELECT v.*, 
                   (SELECT COUNT(*) FROM visitor_pages WHERE visitor_id = v.id) as pages_visited
            FROM visitors v
            WHERE v.id = ?
        `, [id]);
        
        if (visitors.length === 0) {
            return res.status(404).json({ error: 'Visitante não encontrado' });
        }
        
        const [pages] = await pool.query(`
            SELECT * FROM visitor_pages
            WHERE visitor_id = ?
            ORDER BY visited_at DESC
        `, [id]);
        
        res.json({
            visitor: visitors[0],
            pages
        });
        
    } catch (error) {
        console.error('Erro ao buscar visitante:', error);
        res.status(500).json({ error: 'Erro ao buscar visitante' });
    }
};

// =====================================================
// CONVERTER VISITANTE EM LEAD
// =====================================================
exports.convertToLead = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { lead_id } = req.body;
        
        await connection.query(
            'UPDATE visitors SET converted = TRUE, lead_id = ? WHERE id = ?',
            [lead_id, id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Visitante convertido em lead com sucesso' });
        
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao converter visitante:', error);
        res.status(500).json({ error: 'Erro ao converter visitante' });
    } finally {
        connection.release();
    }
};