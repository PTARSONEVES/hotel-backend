const pool = require('../../../config/database');

// =====================================================
// BUSCAR NOTIFICAÇÕES DO USUÁRIO
// =====================================================
exports.getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 50, unread_only = false } = req.query;
        
        console.log('📢 Buscando notificações para usuário:', userId);
        
        let query = `
            SELECT * FROM notifications
            WHERE user_id = ?
        `;
        const params = [userId];
        
        if (unread_only === 'true') {
            query += ' AND `read` = 0';
        }
        
        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const [notifications] = await pool.query(query, params);
        
        // Contar não lidas
        const [unreadCount] = await pool.query(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND `read` = 0',
            [userId]
        );
        
        console.log(`✅ ${notifications.length} notificações encontradas, ${unreadCount[0].total} não lidas`);
        
        res.json({
            notifications: notifications || [],
            unreadCount: unreadCount[0]?.total || 0
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar notificações:', error);
        // Retornar array vazio em vez de erro
        res.json({
            notifications: [],
            unreadCount: 0
        });
    }
};

// =====================================================
// MARCAR NOTIFICAÇÃO COMO LIDA
// =====================================================
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        
        const [result] = await pool.query(
            'UPDATE notifications SET `read` = 1 WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        
        res.json({ message: 'Notificação marcada como lida' });
        
    } catch (error) {
        console.error('❌ Erro ao marcar notificação:', error);
        res.status(500).json({ error: 'Erro ao marcar notificação' });
    }
};

// =====================================================
// MARCAR TODAS COMO LIDAS
// =====================================================
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        
        await pool.query(
            'UPDATE notifications SET `read` = 1 WHERE user_id = ? AND `read` = 0',
            [userId]
        );
        
        res.json({ message: 'Todas notificações marcadas como lidas' });
        
    } catch (error) {
        console.error('❌ Erro ao marcar notificações:', error);
        res.status(500).json({ error: 'Erro ao marcar notificações' });
    }
};

// =====================================================
// DELETAR NOTIFICAÇÃO
// =====================================================
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        
        await pool.query(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        
        res.json({ message: 'Notificação excluída' });
        
    } catch (error) {
        console.error('❌ Erro ao excluir notificação:', error);
        res.status(500).json({ error: 'Erro ao excluir notificação' });
    }
};

// =====================================================
// GERAR NOTIFICAÇÕES DE ESTOQUE BAIXO
// =====================================================
exports.generateLowStockNotifications = async () => {
    try {
        // Verificar se a tabela materials existe
        const [tables] = await pool.query("SHOW TABLES LIKE 'materials'");
        if (tables.length === 0) return 0;
        
        // Buscar materiais com estoque baixo
        const [materials] = await pool.query(`
            SELECT m.*, mc.name as category_name
            FROM materials m
            LEFT JOIN material_categories mc ON m.category_id = mc.id
            WHERE m.current_stock <= m.min_stock AND m.current_stock > 0
        `);
        
        if (materials.length === 0) return 0;
        
        const [users] = await pool.query(`
            SELECT id FROM users WHERE role IN ('admin', 'colaborador')
        `);
        
        let created = 0;
        for (const material of materials) {
            const title = `Estoque Baixo: ${material.name}`;
            const message = `O material ${material.name} está com ${material.current_stock} ${material.unit} (mínimo: ${material.min_stock}).`;
            const link = `/maintenance/stock`;
            
            for (const user of users) {
                const [existing] = await pool.query(
                    'SELECT id FROM notifications WHERE user_id = ? AND type = "low_stock" AND `read` = 0 AND title = ?',
                    [user.id, title]
                );
                
                if (existing.length === 0) {
                    await pool.query(
                        `INSERT INTO notifications (user_id, type, title, message, link, created_at)
                         VALUES (?, 'low_stock', ?, ?, ?, NOW())`,
                        [user.id, title, message, link]
                    );
                    created++;
                }
            }
        }
        
        console.log(`📢 Geradas ${created} notificações de estoque baixo`);
        return created;
        
    } catch (error) {
        console.error('❌ Erro ao gerar notificações de estoque:', error);
        return 0;
    }
};

// =====================================================
// GERAR NOTIFICAÇÕES DE OS VENCIDAS
// =====================================================
exports.generateOverdueOSNotifications = async () => {
    try {
        // Verificar se a tabela work_orders existe
        const [tables] = await pool.query("SHOW TABLES LIKE 'work_orders'");
        if (tables.length === 0) return 0;
        
        const [orders] = await pool.query(`
            SELECT wo.*, e.name as equipment_name
            FROM work_orders wo
            JOIN equipment e ON wo.equipment_id = e.id
            WHERE wo.scheduled_date < CURDATE()
              AND wo.status IN ('aberta', 'planejada', 'em_andamento')
        `);
        
        if (orders.length === 0) return 0;
        
        const [users] = await pool.query(`
            SELECT id FROM users WHERE role IN ('admin', 'colaborador')
        `);
        
        let created = 0;
        for (const order of orders) {
            const daysOverdue = Math.floor((new Date() - new Date(order.scheduled_date)) / (1000 * 60 * 60 * 24));
            
            const title = `OS Atrasada: ${order.title}`;
            const message = `A OS "${order.title}" está atrasada há ${daysOverdue} dias. Equipamento: ${order.equipment_name}.`;
            const link = `/maintenance/work-orders/${order.id}`;
            
            for (const user of users) {
                const [existing] = await pool.query(
                    'SELECT id FROM notifications WHERE user_id = ? AND type = "overdue_os" AND `read` = 0 AND title = ?',
                    [user.id, title]
                );
                
                if (existing.length === 0) {
                    await pool.query(
                        `INSERT INTO notifications (user_id, type, title, message, link, created_at)
                         VALUES (?, 'overdue_os', ?, ?, ?, NOW())`,
                        [user.id, title, message, link]
                    );
                    created++;
                }
            }
        }
        
        console.log(`📢 Geradas ${created} notificações de OS atrasadas`);
        return created;
        
    } catch (error) {
        console.error('❌ Erro ao gerar notificações de OS:', error);
        return 0;
    }
};

// =====================================================
// EXECUTAR CRON JOB
// =====================================================
exports.runNotificationJobs = async (req, res) => {
    try {
        const lowStock = await exports.generateLowStockNotifications();
        const overdueOS = await exports.generateOverdueOSNotifications();
        
        res.json({
            success: true,
            notifications: {
                low_stock: lowStock,
                overdue_os: overdueOS
            }
        });
    } catch (error) {
        console.error('❌ Erro ao executar jobs:', error);
        res.status(500).json({ error: 'Erro ao executar jobs' });
    }
};