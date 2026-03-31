const pool = require('../../../config/database');
const { registerOperation } = require('../../../utils/codeGenerator');

// =====================================================
// ORDENS DE SERVIÇO
// =====================================================

// =====================================================
// CRIAR ORDEM DE SERVIÇO (COM CÓDIGO DE OPERAÇÃO)
// =====================================================
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
        
        console.log('📝 Criando ordem de serviço:', { title, equipment_id });
        
        const [result] = await pool.query(
            `INSERT INTO work_orders 
             (equipment_id, title, description, type, priority, scheduled_date, 
              assigned_to, estimated_hours, cost_estimate, created_by, status, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`,
            [
                equipment_id, title, description, type || 'corretiva', 
                priority || 'media', scheduled_date || null,
                assigned_to || null, estimated_hours || null,
                cost_estimate || null, req.userId, req.userId
            ]
        );
        
        const orderId = result.insertId;
        
        // Gerar código de operação
        const operationCode = await registerOperation('work_orders', orderId, pool);
        
        // Atualizar o registro com o código
        await pool.query(
            'UPDATE work_orders SET operation_code = ? WHERE id = ?',
            [operationCode, orderId]
        );
        
        console.log(`✅ Ordem de serviço criada com código: ${operationCode}`);
        
        res.status(201).json({
            id: orderId,
            operationCode,
            message: 'Ordem de serviço criada com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar ordem de serviço:', error);
        res.status(500).json({ error: 'Erro ao criar ordem de serviço' });
    }
};

// =====================================================
// LISTAR ORDENS DE SERVIÇO (COM FILTRO POR CÓDIGO)
// =====================================================
exports.getWorkOrders = async (req, res) => {
    try {
        const { status, priority, equipment_id, startDate, endDate, code } = req.query;
        
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
        if (code) {
            query += ' AND wo.operation_code = ?';
            params.push(code);
        }
        
        query += ' ORDER BY wo.created_at DESC';
        
        const [orders] = await pool.query(query, params);
        res.json(orders);
        
    } catch (error) {
        console.error('Erro ao listar ordens de serviço:', error);
        res.status(500).json({ error: 'Erro ao listar ordens de serviço' });
    }
};

// =====================================================
// BUSCAR ORDEM DE SERVIÇO POR CÓDIGO
// =====================================================
exports.getWorkOrderByCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        const [orders] = await pool.query(
            `SELECT wo.*, 
                    e.name as equipment_name,
                    e.serial_number,
                    u.name as created_by_name,
                    tec.name as assigned_to_name
             FROM work_orders wo
             LEFT JOIN equipment e ON wo.equipment_id = e.id
             LEFT JOIN users u ON wo.created_by = u.id
             LEFT JOIN users tec ON wo.assigned_to = tec.id
             WHERE wo.operation_code = ?`,
            [code]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
        }
        
        res.json(orders[0]);
        
    } catch (error) {
        console.error('Erro ao buscar OS por código:', error);
        res.status(500).json({ error: 'Erro ao buscar ordem de serviço' });
    }
};

//======================================================
// Buscar ordem de serviço por ID
//======================================================
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

//======================================================
// Iniciar ordem de serviço
//======================================================
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

//======================================================
// Concluir ordem de serviço
//======================================================
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

//======================================================
// Cancelar ordem de serviço
//======================================================
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

// =====================================================
// ADICIONAR MATERIAL À ORDEM DE SERVIÇO
// =====================================================
exports.addMaterialToWorkOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { material_id, quantity, unit_price } = req.body;

        // Verificar se a OS existe e está em andamento
        const [workOrder] = await connection.query(
            'SELECT status FROM work_orders WHERE id = ?',
            [id]
        );

        if (workOrder.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
        }

        if (workOrder[0].status !== 'em_andamento') {
            await connection.rollback();
            return res.status(400).json({ error: 'OS deve estar em andamento para consumir materiais' });
        }

        // Verificar material
        const [material] = await connection.query(
            'SELECT * FROM materials WHERE id = ?',
            [material_id]
        );

        if (material.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material não encontrado' });
        }

        if (material[0].current_stock < quantity) {
            await connection.rollback();
            return res.status(400).json({ error: 'Estoque insuficiente' });
        }

        const total_price = quantity * (unit_price || material[0].cost_price || 0);

        // Registrar consumo na work_order_materials
        const [result] = await connection.query(
            `INSERT INTO work_order_materials 
             (work_order_id, material_id, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?)`,
            [id, material_id, quantity, unit_price || material[0].cost_price, total_price]
        );

        // Registrar movimentação de estoque
        const [movement] = await connection.query(
            `INSERT INTO stock_movements 
             (material_id, type, quantity, unit_price, total_price, work_order_id, reason, created_by)
             VALUES (?, 'saida', ?, ?, ?, ?, ?, ?)`,
            [material_id, -quantity, unit_price || material[0].cost_price, total_price, id, `Consumo na OS #${id}`, req.userId]
        );

        // Gerar código de operação para a movimentação
        const { registerOperation } = require('../../../utils/codeGenerator');
        const operationCode = await registerOperation('stock_movements', movement.insertId, connection);

        await connection.query(
            'UPDATE stock_movements SET operation_code = ? WHERE id = ?',
            [operationCode, movement.insertId]
        );

        // Atualizar estoque
        await connection.query(
            'UPDATE materials SET current_stock = current_stock - ? WHERE id = ?',
            [quantity, material_id]
        );

        // Atualizar custo da OS
        await connection.query(
            `UPDATE work_orders 
             SET actual_cost = COALESCE(actual_cost, 0) + ?
             WHERE id = ?`,
            [total_price, id]
        );

        await connection.commit();

        res.status(201).json({
            id: result.insertId,
            message: 'Material adicionado à OS com sucesso'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao adicionar material à OS:', error);
        res.status(500).json({ error: 'Erro ao adicionar material' });
    } finally {
        connection.release();
    }
};

// =====================================================
// REMOVER MATERIAL DA ORDEM DE SERVIÇO
// =====================================================
exports.removeMaterialFromWorkOrder = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id, material_id } = req.params;

        // Buscar o material consumido
        const [consumption] = await connection.query(
            'SELECT * FROM work_order_materials WHERE work_order_id = ? AND material_id = ?',
            [id, material_id]
        );

        if (consumption.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material não encontrado na OS' });
        }

        // Deletar o registro
        await connection.query(
            'DELETE FROM work_order_materials WHERE work_order_id = ? AND material_id = ?',
            [id, material_id]
        );

        // Reverter estoque
        await connection.query(
            'UPDATE materials SET current_stock = current_stock + ? WHERE id = ?',
            [consumption[0].quantity, material_id]
        );

        // Reverter custo da OS
        await connection.query(
            `UPDATE work_orders 
             SET actual_cost = COALESCE(actual_cost, 0) - ?
             WHERE id = ?`,
            [consumption[0].total_price, id]
        );

        await connection.commit();

        res.json({ message: 'Material removido da OS com sucesso' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao remover material da OS:', error);
        res.status(500).json({ error: 'Erro ao remover material' });
    } finally {
        connection.release();
    }
};

// =====================================================
// LISTAR MATERIAIS DA ORDEM DE SERVIÇO
// =====================================================
exports.getWorkOrderMaterials = async (req, res) => {
    try {
        const { id } = req.params;

        const [materials] = await pool.query(`
            SELECT wom.*, 
                   m.name as material_name,
                   m.code as material_code,
                   m.unit
            FROM work_order_materials wom
            JOIN materials m ON wom.material_id = m.id
            WHERE wom.work_order_id = ?
            ORDER BY wom.created_at DESC
        `, [id]);

        res.json(materials);

    } catch (error) {
        console.error('Erro ao listar materiais da OS:', error);
        res.status(500).json({ error: 'Erro ao listar materiais' });
    }
};