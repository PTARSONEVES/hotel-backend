const pool = require('../../../config/database');

// Relatório de ocupação
exports.occupancyReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const [report] = await pool.query(`
            SELECT 
                DATE(b.check_in) as date,
                COUNT(DISTINCT b.id) as total_bookings,
                COUNT(DISTINCT b.room_id) as occupied_rooms,
                (SELECT COUNT(*) FROM rooms) as total_rooms,
                ROUND(COUNT(DISTINCT b.room_id) * 100.0 / (SELECT COUNT(*) FROM rooms), 2) as occupancy_rate,
                SUM(b.total_amount) as revenue,
                AVG(b.total_amount) as average_ticket,
                SUM(CASE WHEN b.status = 'checkout' THEN 1 ELSE 0 END) as completed_stays
            FROM bookings b
            WHERE b.check_in BETWEEN ? AND ?
              AND b.status NOT IN ('cancelado', 'noshow')
            GROUP BY DATE(b.check_in)
            ORDER BY date
        `, [start_date, end_date]);
        
        // Totais do período
        const [totals] = await pool.query(`
            SELECT 
                COUNT(DISTINCT b.id) as total_reservas,
                SUM(b.total_amount) as receita_total,
                AVG(b.total_amount) as ticket_medio,
                COUNT(DISTINCT b.guest_id) as hospedes_unicos
            FROM bookings b
            WHERE b.check_in BETWEEN ? AND ?
              AND b.status NOT IN ('cancelado', 'noshow')
        `, [start_date, end_date]);
        
        res.json({
            daily: report,
            totals: totals[0]
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de ocupação:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
};

// Relatório de consumo
exports.consumptionReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const [report] = await pool.query(`
            SELECT 
                p.id,
                p.name as product_name,
                pc.name as category,
                COUNT(c.id) as total_sold,
                SUM(c.quantity) as total_quantity,
                SUM(c.total_price) as total_revenue,
                AVG(c.unit_price) as average_price
            FROM consumptions c
            JOIN products p ON c.description = p.name
            JOIN product_categories pc ON p.category_id = pc.id
            WHERE DATE(c.consumption_date) BETWEEN ? AND ?
            GROUP BY p.id, p.name, pc.name
            ORDER BY total_revenue DESC
        `, [start_date, end_date]);
        
        // Totais por categoria
        const [byCategory] = await pool.query(`
            SELECT 
                pc.name as category,
                COUNT(c.id) as total_items,
                SUM(c.total_price) as total_revenue
            FROM consumptions c
            JOIN products p ON c.description = p.name
            JOIN product_categories pc ON p.category_id = pc.id
            WHERE DATE(c.consumption_date) BETWEEN ? AND ?
            GROUP BY pc.name
            ORDER BY total_revenue DESC
        `, [start_date, end_date]);
        
        res.json({
            products: report,
            byCategory
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de consumo:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
};

// Relatório financeiro integrado
exports.financialReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        // Receitas do hotel
        const [hotelRevenue] = await pool.query(`
            SELECT 
                DATE(b.check_out) as date,
                SUM(b.total_amount) as room_revenue,
                SUM(c.total_price) as consumption_revenue,
                COUNT(b.id) as total_bookings
            FROM bookings b
            LEFT JOIN consumptions c ON b.id = c.booking_id
            WHERE b.status = 'checkout'
              AND DATE(b.check_out) BETWEEN ? AND ?
            GROUP BY DATE(b.check_out)
            ORDER BY date
        `, [start_date, end_date]);
        
        // Comparativo com contas a receber (sistema financeiro)
        const [accountsReceivable] = await pool.query(`
            SELECT 
                DATE(due_date) as date,
                SUM(amount) as expected,
                SUM(CASE WHEN status = 'pago' THEN amount ELSE 0 END) as received
            FROM accounts
            WHERE type = 'receber'
              AND DATE(due_date) BETWEEN ? AND ?
            GROUP BY DATE(due_date)
            ORDER BY date
        `, [start_date, end_date]);
        
        // Resumo do período
        const [summary] = await pool.query(`
            SELECT 
                (SELECT SUM(total_amount) FROM bookings WHERE status = 'checkout' AND DATE(check_out) BETWEEN ? AND ?) as total_room_revenue,
                (SELECT SUM(total_price) FROM consumptions WHERE DATE(consumption_date) BETWEEN ? AND ?) as total_consumption,
                (SELECT COUNT(*) FROM bookings WHERE DATE(check_in) BETWEEN ? AND ?) as new_bookings,
                (SELECT COUNT(*) FROM guests WHERE DATE(created_at) BETWEEN ? AND ?) as new_guests
        `, [start_date, end_date, start_date, end_date, start_date, end_date, start_date, end_date]);
        
        res.json({
            daily: hotelRevenue,
            accounts: accountsReceivable,
            summary: summary[0]
        });
    } catch (error) {
        console.error('Erro ao gerar relatório financeiro:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
};

// Dashboard executivo
exports.executiveDashboard = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        
        // Ocupação atual
        const [occupancy] = await pool.query(`
            SELECT 
                COUNT(*) as total_rooms,
                SUM(CASE WHEN status = 'ocupado' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'disponivel' THEN 1 ELSE 0 END) as available,
                SUM(CASE WHEN status = 'manutencao' THEN 1 ELSE 0 END) as maintenance
            FROM rooms
        `);
        
        // Reservas de hoje
        const [todayBookings] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'checkin' THEN 1 ELSE 0 END) as checkins,
                SUM(CASE WHEN status = 'checkout' THEN 1 ELSE 0 END) as checkouts
            FROM bookings
            WHERE ? BETWEEN check_in AND check_out
        `, [today]);
        
        // Faturamento do mês
        const [monthlyRevenue] = await pool.query(`
            SELECT 
                SUM(total_amount) as revenue,
                SUM(CASE WHEN payment_status = 'pago' THEN total_amount ELSE 0 END) as received
            FROM bookings
            WHERE status = 'checkout'
              AND check_out >= ?
        `, [firstDayMonth]);
        
        // Top produtos mais consumidos
        const [topProducts] = await pool.query(`
            SELECT 
                c.description,
                COUNT(*) as total,
                SUM(c.total_price) as revenue
            FROM consumptions c
            WHERE DATE(c.consumption_date) >= ?
            GROUP BY c.description
            ORDER BY total DESC
            LIMIT 5
        `, [firstDayMonth]);
        
        // Próximos check-ins
        const [upcomingCheckins] = await pool.query(`
            SELECT b.*, g.name as guest_name, r.room_number
            FROM bookings b
            JOIN guests g ON b.guest_id = g.id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.check_in = ?
              AND b.status = 'reservado'
            ORDER BY b.created_at
        `, [today]);
        
        res.json({
            occupancy: occupancy[0],
            today: todayBookings[0],
            revenue: monthlyRevenue[0],
            topProducts,
            upcomingCheckins
        });
    } catch (error) {
        console.error('Erro ao gerar dashboard executivo:', error);
        res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
};