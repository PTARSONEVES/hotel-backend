const pool = require('../../../config/database');

// =====================================================
// ORDENS DE SERVIÇO
// =====================================================

// Listar ordens de serviço
exports.getWorkOrders = async (req, res) => {
    try {
        const { status, priority, equipment_id, startDate, endDate } = req.query;

        let query = `
            SELECT wo.*, 
                   e.name as equipment_name,
                   e.serial_number,
                   u.name as created_by_name,
                   tec.name as assigned_to_name
            FROM work_orders wo
            LEFT JOIN equipment e ON wo.equipment_id = e.id
            LEFT JOIN users u ON wo.created_by = u.id
            LEFT JOIN users tec ON wo.assigned_to = tec.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND wo.status = ?';
            params.push(status);
        }
        if (priority) {
            query += ' AND wo.priority = ?';
            params.push(priority);
        }
        if (equipment_id) {
            query += ' AND wo.equipment_id = ?';
            params.push(equipment_id);
        }
        if (startDate) {
            query += ' AND DATE(wo.scheduled_date) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(wo.scheduled_date) <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY wo.created_at DESC';

        const [orders] = await pool.query(query, params);
        res.json(orders);

    } catch (error) {
        console.error('Erro ao listar ordens de serviço:', error);
        res.status(500).json({ error: 'Erro ao listar ordens de serviço' });
    }
};

// Buscar ordem de serviço por ID
exports.getWorkOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const [orders] = await pool.query(
            `SELECT wo.*, 
                    e.name as equipment_name,
                    e.serial_number,
                    e.model,
                    e.manufacturer,
                    u.name as created_by_name,
                    tec.name as assigned_to_name
             FROM work_orders wo
             LEFT JOIN equipment e ON wo.equipment_id = e.id
             LEFT JOIN users u ON wo.created_by = u.id
             LEFT JOIN users tec ON wo.assigned_to = tec.id
             WHERE wo.id = ?`,
            [id]
        );

        if (orders.length === 0) {
            return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
        }

        // Buscar checklist
        const [checklist] = await pool.query(
            'SELECT * FROM maintenance_checklists WHERE work_order_id = ?',
            [id]
        );

        // Buscar materiais usados
        const [materials] = await pool.query(
            `SELECT wm.*, m.name as material_name, m.code as material_code
             FROM work_order_materials wm
             JOIN materials m ON wm.material_id = m.id
             WHERE wm.work_order_id = ?`,
            [id]
        );

        res.json({
            ...orders[0],
            checklist,
            materials
        });

    } catch (error) {
        console.error('Erro ao buscar ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao buscar ordem de serviço' });
    }
};

// Criar ordem de serviço
exports.createWorkOrder = async (req, res) => {
    try {
        const {
            equipment_id,
            title,
            description,
            type,
            priority,
            scheduled_date,
            assigned_to,
            estimated_hours,
            cost_estimate
        } = req.body;

        const [result] = await pool.query(
            `INSERT INTO work_orders 
             (equipment_id, title, description, type, priority, scheduled_date, 
              assigned_to, estimated_hours, cost_estimate, created_by, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta')`,
            [
                equipment_id, title, description, type, priority || 'media',
                scheduled_date, assigned_to || null, estimated_hours || null,
                cost_estimate || null, req.userId
            ]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Ordem de serviço criada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao criar ordem de serviço' });
    }
};

// Iniciar ordem de serviço
exports.startWorkOrder = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            `UPDATE work_orders 
             SET status = 'em_andamento', start_date = NOW()
             WHERE id = ? AND status = 'aberta'`,
            [id]
        );

        res.json({ message: 'Ordem de serviço iniciada' });

    } catch (error) {
        console.error('Erro ao iniciar ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao iniciar ordem de serviço' });
    }
};

// Concluir ordem de serviço
exports.completeWorkOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            findings,
            recommendations,
            total_hours,
            actual_cost,
            checklist_items,
            materials_used
        } = req.body;

        // Atualizar OS
        await connection.query(
            `UPDATE work_orders 
             SET status = 'concluida', 
                 completion_date = NOW(),
                 findings = ?,
                 recommendations = ?,
                 total_hours = ?,
                 actual_cost = ?
             WHERE id = ?`,
            [findings, recommendations, total_hours, actual_cost, id]
        );

        // Registrar checklist
        if (checklist_items && checklist_items.length > 0) {
            for (const item of checklist_items) {
                await connection.query(
                    `INSERT INTO maintenance_checklists 
                     (work_order_id, item, expected_result, actual_result, status, observations)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, item.item, item.expected, item.actual, item.status, item.observations]
                );
            }
        }

        // Registrar materiais usados e dar baixa no estoque
        if (materials_used && materials_used.length > 0) {
            for (const mat of materials_used) {
                await connection.query(
                    `INSERT INTO work_order_materials 
                     (work_order_id, material_id, quantity, unit_price, total_price)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, mat.material_id, mat.quantity, mat.unit_price, mat.quantity * mat.unit_price]
                );

                // Dar baixa no estoque
                await connection.query(
                    `UPDATE materials SET current_stock = current_stock - ? WHERE id = ?`,
                    [mat.quantity, mat.material_id]
                );

                // Registrar movimentação
                await connection.query(
                    `INSERT INTO stock_movements 
                     (material_id, type, quantity, unit_price, total_price, work_order_id, reason, created_by)
                     VALUES (?, 'saida', ?, ?, ?, ?, ?, ?)`,
                    [
                        mat.material_id, mat.quantity, mat.unit_price,
                        mat.quantity * mat.unit_price, id,
                        `Consumo na OS #${id}`, req.userId
                    ]
                );
            }
        }

        // Se era uma OS preventiva, atualizar último execução do plano
        const [order] = await connection.query(
            'SELECT type, equipment_id FROM work_orders WHERE id = ?',
            [id]
        );

        if (order[0]?.type === 'preventiva') {
            await connection.query(
                `UPDATE maintenance_plans 
                 SET last_execution = CURDATE(),
                     next_execution = DATE_ADD(CURDATE(), INTERVAL frequency_value frequency_type)
                 WHERE equipment_id = ? AND active = TRUE`,
                [order[0].equipment_id]
            );
        }

        await connection.commit();

        res.json({ message: 'Ordem de serviço concluída com sucesso' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao concluir ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao concluir ordem de serviço' });
    } finally {
        connection.release();
    }
};

// Cancelar ordem de serviço
exports.cancelWorkOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        await pool.query(
            `UPDATE work_orders 
             SET status = 'cancelada', findings = ?
             WHERE id = ?`,
            [reason, id]
        );

        res.json({ message: 'Ordem de serviço cancelada' });

    } catch (error) {
        console.error('Erro ao cancelar ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao cancelar ordem de serviço' });
    }
};