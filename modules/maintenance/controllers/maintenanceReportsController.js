const pool = require('../../../config/database');

// =====================================================
// INDICADORES DE MANUTENÇÃO
// =====================================================

// Dashboard de manutenção
exports.getDashboard = async (req, res) => {
    try {
        // Resumo geral
        const [summary] = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM work_orders WHERE status = 'aberta') as open_orders,
                (SELECT COUNT(*) FROM work_orders WHERE status = 'em_andamento') as in_progress,
                (SELECT COUNT(*) FROM work_orders WHERE status = 'concluida' AND completion_date >= CURDATE() - INTERVAL 30 DAY) as completed_month,
                (SELECT COUNT(*) FROM equipment WHERE status = 'manutencao') as equipment_in_maintenance,
                (SELECT COUNT(*) FROM equipment) as total_equipment,
                (SELECT COUNT(*) FROM materials WHERE current_stock <= min_stock) as low_stock_items
            `
        );

        // Ordens por prioridade
        const [byPriority] = await pool.query(
            `SELECT priority, COUNT(*) as count
             FROM work_orders
             WHERE status IN ('aberta', 'em_andamento')
             GROUP BY priority
             ORDER BY FIELD(priority, 'urgente', 'alta', 'media', 'baixa')`
        );

        // Ordens por tipo
        const [byType] = await pool.query(
            `SELECT type, COUNT(*) as count
             FROM work_orders
             WHERE created_at >= CURDATE() - INTERVAL 30 DAY
             GROUP BY type`
        );

        // Top 5 equipamentos com mais manutenções
        const [topEquipment] = await pool.query(
            `SELECT e.name, e.serial_number, COUNT(wo.id) as maintenance_count
             FROM equipment e
             JOIN work_orders wo ON e.id = wo.equipment_id
             WHERE wo.created_at >= CURDATE() - INTERVAL 90 DAY
             GROUP BY e.id
             ORDER BY maintenance_count DESC
             LIMIT 5`
        );

        // Custos do mês
        const [costs] = await pool.query(
            `SELECT 
                COALESCE(SUM(actual_cost), 0) as total_cost,
                COALESCE(SUM(CASE WHEN type = 'preventiva' THEN actual_cost ELSE 0 END), 0) as preventive_cost,
                COALESCE(SUM(CASE WHEN type = 'corretiva' THEN actual_cost ELSE 0 END), 0) as corrective_cost
             FROM work_orders
             WHERE completion_date >= CURDATE() - INTERVAL 30 DAY
               AND status = 'concluida'`
        );

        res.json({
            summary: summary[0],
            byPriority,
            byType,
            topEquipment,
            costs: costs[0]
        });

    } catch (error) {
        console.error('Erro ao carregar dashboard de manutenção:', error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
};

// Calcular indicadores MTBF e MTTR
exports.getIndicators = async (req, res) => {
    try {
        const { equipment_id, startDate, endDate } = req.query;

        let query = `
            SELECT 
                e.id,
                e.name,
                COUNT(fh.id) as failure_count,
                SUM(fh.downtime_hours) as total_downtime,
                AVG(fh.downtime_hours) as mttr,
                (SELECT COUNT(*) FROM work_orders 
                 WHERE equipment_id = e.id AND status = 'concluida'
                 AND completion_date BETWEEN ? AND ?) as total_orders
            FROM equipment e
            LEFT JOIN failure_history fh ON e.id = fh.equipment_id
                AND fh.failure_date BETWEEN ? AND ?
            WHERE 1=1
        `;
        const params = [startDate, endDate, startDate, endDate];

        if (equipment_id) {
            query += ' AND e.id = ?';
            params.push(equipment_id);
        }

        query += ' GROUP BY e.id';

        const [indicators] = await pool.query(query, params);

        // Calcular MTBF (Tempo Médio Entre Falhas) em dias
        const result = indicators.map(i => ({
            ...i,
            mtbf: i.failure_count > 0 
                ? (i.total_orders * 24 / i.failure_count).toFixed(2) // horas
                : 'N/A'
        }));

        res.json(result);

    } catch (error) {
        console.error('Erro ao calcular indicadores:', error);
        res.status(500).json({ error: 'Erro ao calcular indicadores' });
    }
};

// Relatório de consumo de materiais
exports.getMaterialConsumption = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const [consumption] = await pool.query(
            `SELECT 
                m.id,
                m.code,
                m.name,
                mc.name as category,
                SUM(wm.quantity) as total_quantity,
                SUM(wm.total_price) as total_cost,
                COUNT(DISTINCT wm.work_order_id) as orders_used
             FROM work_order_materials wm
             JOIN materials m ON wm.material_id = m.id
             JOIN material_categories mc ON m.category_id = mc.id
             JOIN work_orders wo ON wm.work_order_id = wo.id
             WHERE wo.completion_date BETWEEN ? AND ?
             GROUP BY m.id
             ORDER BY total_cost DESC`,
            [startDate, endDate]
        );

        res.json(consumption);

    } catch (error) {
        console.error('Erro ao gerar relatório de consumo:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
};

// =====================================================
// DADOS PARA GRÁFICO DE OS POR STATUS
// =====================================================
exports.getWorkOrdersByStatus = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                status,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as concluidas,
                SUM(CASE WHEN status = 'aberta' THEN 1 ELSE 0 END) as abertas,
                SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) as em_andamento,
                SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) as canceladas
            FROM work_orders
            WHERE 1=1
        `;
        const params = [];
        
        if (startDate) {
            query += ' AND DATE(created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(created_at) <= ?';
            params.push(endDate);
        }
        
        query += ' GROUP BY status';
        
        const [statusData] = await pool.query(query, params);
        res.json(statusData);
        
    } catch (error) {
        console.error('Erro ao buscar dados de status:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
};

// =====================================================
// DADOS PARA GRÁFICO DE CUSTOS POR MÊS
// =====================================================
exports.getMonthlyCosts = async (req, res) => {
    try {
        const { year } = req.query;
        const ano = year || new Date().getFullYear();
        
        const [costs] = await pool.query(`
            SELECT 
                MONTH(completion_date) as mes,
                SUM(actual_cost) as custo_mao_obra,
                COALESCE((
                    SELECT SUM(total_price) 
                    FROM work_order_materials wom
                    JOIN work_orders wo2 ON wom.work_order_id = wo2.id
                    WHERE MONTH(wo2.completion_date) = mes AND YEAR(wo2.completion_date) = ?
                ), 0) as custo_materiais
            FROM work_orders
            WHERE YEAR(completion_date) = ? AND status = 'concluida'
            GROUP BY MONTH(completion_date)
            ORDER BY mes
        `, [ano, ano]);
        
        res.json(costs);
        
    } catch (error) {
        console.error('Erro ao buscar custos mensais:', error);
        res.status(500).json({ error: 'Erro ao buscar custos' });
    }
};

// =====================================================
// DADOS PARA GRÁFICO DE MATERIAIS MAIS UTILIZADOS
// =====================================================
exports.getTopMaterials = async (req, res) => {
    try {
        const { limit = 10, startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                m.id,
                m.name,
                m.code,
                SUM(wom.quantity) as total_quantidade,
                SUM(wom.total_price) as total_custo
            FROM work_order_materials wom
            JOIN materials m ON wom.material_id = m.id
            JOIN work_orders wo ON wom.work_order_id = wo.id
            WHERE wo.status = 'concluida'
        `;
        const params = [];
        
        if (startDate) {
            query += ' AND DATE(wo.completion_date) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(wo.completion_date) <= ?';
            params.push(endDate);
        }
        
        query += ` GROUP BY m.id, m.name, m.code
                   ORDER BY total_quantidade DESC
                   LIMIT ?`;
        params.push(parseInt(limit));
        
        const [materials] = await pool.query(query, params);
        res.json(materials);
        
    } catch (error) {
        console.error('Erro ao buscar materiais mais utilizados:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
};

// =====================================================
// DADOS PARA GRÁFICO DE EQUIPAMENTOS COM MAIS OS
// =====================================================
exports.getTopEquipment = async (req, res) => {
    try {
        const { limit = 10, startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                e.id,
                e.name,
                e.serial_number,
                COUNT(wo.id) as total_os,
                SUM(CASE WHEN wo.status = 'concluida' THEN 1 ELSE 0 END) as concluidas,
                AVG(wo.total_hours) as media_horas,
                AVG(wo.actual_cost) as media_custo
            FROM equipment e
            JOIN work_orders wo ON e.id = wo.equipment_id
            WHERE 1=1
        `;
        const params = [];
        
        if (startDate) {
            query += ' AND DATE(wo.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(wo.created_at) <= ?';
            params.push(endDate);
        }
        
        query += ` GROUP BY e.id, e.name, e.serial_number
                   ORDER BY total_os DESC
                   LIMIT ?`;
        params.push(parseInt(limit));
        
        const [equipment] = await pool.query(query, params);
        res.json(equipment);
        
    } catch (error) {
        console.error('Erro ao buscar equipamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
};