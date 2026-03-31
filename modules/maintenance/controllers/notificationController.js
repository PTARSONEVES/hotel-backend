const pool = require('../../../config/database');

// =====================================================
// CRIAR NOTIFICAÇÃO
// =====================================================
async function createNotification(userId, type, title, message, link = null) {
    try {
        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, link, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [userId, type, title, message, link]
        );
        console.log(`🔔 Notificação criada para usuário ${userId}: ${title}`);
    } catch (error) {
        console.error('Erro ao criar notificação:', error);
    }
}

// =====================================================
// GERAR NOTIFICAÇÕES DE ESTOQUE BAIXO
// =====================================================
exports.generateLowStockNotifications = async () => {
    try {
        // Buscar materiais com estoque baixo
        const [materials] = await pool.query(`
            SELECT m.*, mc.name as category_name
            FROM materials m
            JOIN material_categories mc ON m.category_id = mc.id
            WHERE m.current_stock <= m.min_stock
        `);

        // Buscar administradores e colaboradores
        const [users] = await pool.query(`
            SELECT id FROM users WHERE role IN ('admin', 'colaborador')
        `);

        for (const material of materials) {
            const title = `Estoque Baixo: ${material.name}`;
            const message = `O material ${material.name} está com ${material.current_stock} ${material.unit} (mínimo: ${material.min_stock}). É necessário repor o estoque.`;
            const link = `/maintenance/stock`;

            for (const user of users) {
                await createNotification(user.id, 'low_stock', title, message, link);
            }
        }

        return materials.length;
    } catch (error) {
        console.error('Erro ao gerar notificações de estoque:', error);
        return 0;
    }
};

// =====================================================
// GERAR NOTIFICAÇÕES DE OS VENCIDAS
// =====================================================
exports.generateOverdueOSNotifications = async () => {
    try {
        const [orders] = await pool.query(`
            SELECT wo.*, e.name as equipment_name, u.name as technician_name
            FROM work_orders wo
            JOIN equipment e ON wo.equipment_id = e.id
            LEFT JOIN users u ON wo.assigned_to = u.id
            WHERE wo.scheduled_date < CURDATE()
              AND wo.status IN ('aberta', 'planejada', 'em_andamento')
        `);

        for (const order of orders) {
            const daysOverdue = Math.floor((new Date() - new Date(order.scheduled_date)) / (1000 * 60 * 60 * 24));
            
            const title = `OS Atrasada: ${order.title}`;
            const message = `A ordem de serviço "${order.title}" está atrasada há ${daysOverdue} dias. Equipamento: ${order.equipment_name}.`;
            const link = `/maintenance/work-orders/${order.id}`;

            // Notificar administradores e o técnico responsável
            const [users] = await pool.query(`
                SELECT id FROM users WHERE role IN ('admin', 'colaborador')
                ${order.assigned_to ? ` OR id = ${order.assigned_to}` : ''}
            `);

            for (const user of users) {
                await createNotification(user.id, 'overdue_os', title, message, link);
            }
        }

        return orders.length;
    } catch (error) {
        console.error('Erro ao gerar notificações de OS atrasadas:', error);
        return 0;
    }
};

// =====================================================
// BUSCAR NOTIFICAÇÕES DO USUÁRIO
// =====================================================
exports.getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 50, unread_only = false } = req.query;

        let query = `
            SELECT * FROM notifications
            WHERE user_id = ?
        `;
        const params = [userId];

        if (unread_only === 'true') {
            query += ' AND read = FALSE';
        }

        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const [notifications] = await pool.query(query, params);
        
        // Contar não lidas
        const [unreadCount] = await pool.query(
            'SELECT COUNT(*) as total FROM notifications WHERE user_id = ? AND read = FALSE',
            [userId]
        );

        res.json({
            notifications,
            unreadCount: unreadCount[0].total
        });
    } catch (error) {
        console.error('Erro ao buscar notificações:', error);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
};

// =====================================================
// MARCAR NOTIFICAÇÃO COMO LIDA
// =====================================================
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        await pool.query(
            'UPDATE notifications SET read = TRUE WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        res.json({ message: 'Notificação marcada como lida' });
    } catch (error) {
        console.error('Erro ao marcar notificação:', error);
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
            'UPDATE notifications SET read = TRUE WHERE user_id = ? AND read = FALSE',
            [userId]
        );

        res.json({ message: 'Todas notificações marcadas como lidas' });
    } catch (error) {
        console.error('Erro ao marcar notificações:', error);
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
        console.error('Erro ao excluir notificação:', error);
        res.status(500).json({ error: 'Erro ao excluir notificação' });
    }
};

// =====================================================
// EXECUTAR CRON JOB DE NOTIFICAÇÕES
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
        console.error('Erro ao executar jobs:', error);
        res.status(500).json({ error: 'Erro ao executar jobs' });
    }
};

module.exports.createNotification = createNotification;
