const pool = require('../config/database');

// =====================================================
// GERAR ALERTAS BASEADOS EM COMPORTAMENTO
// =====================================================
exports.generateAlerts = async (req, res) => {
    try {
        const alerts = [];
        
        // 1. Visitantes com múltiplas visitas (alto interesse)
        const [multipleVisits] = await pool.query(`
            SELECT v.id, v.session_id, v.visit_count, v.first_visit, v.last_visit,
                   COUNT(vp.id) as pages_viewed
            FROM visitors v
            LEFT JOIN visitor_pages vp ON v.id = vp.visitor_id
            WHERE v.visit_count >= 3
              AND v.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
              AND NOT EXISTS (
                  SELECT 1 FROM behavior_alerts 
                  WHERE visitor_id = v.id AND alert_type = 'multiple_visits' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
              )
            GROUP BY v.id
        `);
        
        for (const visitor of multipleVisits) {
            alerts.push({
                visitor_id: visitor.id,
                alert_type: 'multiple_visits',
                severity: 'medium',
                message: `Visitante retornou ${visitor.visit_count} vezes nos últimos 7 dias. Alto potencial de conversão.`,
                data: JSON.stringify({ visit_count: visitor.visit_count, pages_viewed: visitor.pages_viewed })
            });
        }
        
        // 2. Visitantes que acessaram página de preços (intenção de compra)
        const [priceCheck] = await pool.query(`
            SELECT DISTINCT v.id, v.session_id, v.visit_count
            FROM visitors v
            JOIN visitor_pages vp ON v.id = vp.visitor_id
            WHERE vp.page_url LIKE '%flats%' OR vp.page_url LIKE '%pre-reserva%'
              AND vp.visited_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
              AND NOT EXISTS (
                  SELECT 1 FROM behavior_alerts 
                  WHERE visitor_id = v.id AND alert_type = 'price_check' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
              )
        `);
        
        for (const visitor of priceCheck) {
            alerts.push({
                visitor_id: visitor.id,
                alert_type: 'price_check',
                severity: 'high',
                message: `Visitante demonstrou interesse em preços/promoções. Potencial lead quente.`,
                data: JSON.stringify({})
            });
        }
        
        // 3. Visitantes que passaram mais de 5 minutos no site
        const [longSession] = await pool.query(`
            SELECT v.id, v.session_id, 
                   TIMESTAMPDIFF(MINUTE, v.first_visit, v.last_visit) as session_minutes
            FROM visitors v
            WHERE TIMESTAMPDIFF(MINUTE, v.first_visit, v.last_visit) >= 5
              AND v.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
              AND NOT EXISTS (
                  SELECT 1 FROM behavior_alerts 
                  WHERE visitor_id = v.id AND alert_type = 'long_session' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
              )
        `);
        
        for (const visitor of longSession) {
            alerts.push({
                visitor_id: visitor.id,
                alert_type: 'long_session',
                severity: 'high',
                message: `Visitante permaneceu ${visitor.session_minutes} minutos no site. Alto engajamento.`,
                data: JSON.stringify({ session_minutes: visitor.session_minutes })
            });
        }
        
        // 4. Visitantes que tentaram fazer reserva (intenção máxima)
        const [bookingAttempt] = await pool.query(`
            SELECT DISTINCT v.id, v.session_id
            FROM visitors v
            JOIN visitor_pages vp ON v.id = vp.visitor_id
            WHERE vp.page_url LIKE '%booking%' OR vp.page_url LIKE '%reserva%'
              AND vp.visited_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
              AND NOT EXISTS (
                  SELECT 1 FROM behavior_alerts 
                  WHERE visitor_id = v.id AND alert_type = 'booking_attempt' AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
              )
        `);
        
        for (const visitor of bookingAttempt) {
            alerts.push({
                visitor_id: visitor.id,
                alert_type: 'booking_attempt',
                severity: 'critical',
                message: `Visitante iniciou processo de reserva! Contatar com urgência.`,
                data: JSON.stringify({})
            });
        }
        
        // Salvar alertas no banco
        for (const alert of alerts) {
            await pool.query(
                `INSERT INTO behavior_alerts 
                 (visitor_id, alert_type, severity, message, data, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [alert.visitor_id, alert.alert_type, alert.severity, alert.message, alert.data]
            );
        }
        
        res.json({
            success: true,
            alerts_generated: alerts.length,
            alerts
        });
        
    } catch (error) {
        console.error('Erro ao gerar alertas:', error);
        res.status(500).json({ error: 'Erro ao gerar alertas' });
    }
};

// =====================================================
// LISTAR ALERTAS
// =====================================================
exports.getAlerts = async (req, res) => {
    try {
        const { limit = 50, unread_only = false, severity } = req.query;
        
        let query = `
            SELECT a.*, 
                   v.session_id,
                   v.browser,
                   v.os,
                   v.device_type,
                   v.city,
                   v.country
            FROM behavior_alerts a
            JOIN visitors v ON a.visitor_id = v.id
            WHERE 1=1
        `;
        const params = [];
        
        if (unread_only === 'true') {
            query += ' AND a.read = FALSE';
        }
        if (severity) {
            query += ' AND a.severity = ?';
            params.push(severity);
        }
        
        query += ` ORDER BY 
                    FIELD(a.severity, 'critical', 'high', 'medium', 'low'),
                    a.created_at DESC 
                   LIMIT ?`;
        params.push(parseInt(limit));
        
        const [alerts] = await pool.query(query, params);
        
        const [unreadCount] = await pool.query(
            'SELECT COUNT(*) as total FROM behavior_alerts WHERE read = FALSE'
        );
        
        res.json({
            alerts,
            unreadCount: unreadCount[0].total
        });
        
    } catch (error) {
        console.error('Erro ao listar alertas:', error);
        res.status(500).json({ error: 'Erro ao listar alertas' });
    }
};

// =====================================================
// MARCAR ALERTA COMO LIDO
// =====================================================
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(
            'UPDATE behavior_alerts SET read = TRUE WHERE id = ?',
            [id]
        );
        
        res.json({ message: 'Alerta marcado como lido' });
        
    } catch (error) {
        console.error('Erro ao marcar alerta:', error);
        res.status(500).json({ error: 'Erro ao marcar alerta' });
    }
};

// =====================================================
// MARCAR TODOS COMO LIDOS
// =====================================================
exports.markAllAsRead = async (req, res) => {
    try {
        await pool.query('UPDATE behavior_alerts SET read = TRUE WHERE read = FALSE');
        res.json({ message: 'Todos alertas marcados como lidos' });
        
    } catch (error) {
        console.error('Erro ao marcar alertas:', error);
        res.status(500).json({ error: 'Erro ao marcar alertas' });
    }
};