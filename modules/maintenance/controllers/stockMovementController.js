const pool = require('../../../config/database');
const { registerOperation } = require('../../../utils/codeGenerator');

// =====================================================
// LISTAR MOVIMENTAÇÕES
// =====================================================
exports.getMovements = async (req, res) => {
    try {
        const { material_id, type, startDate, endDate } = req.query;

        let query = `
            SELECT sm.*, 
                   m.name as material_name,
                   m.code as material_code,
                   m.unit,
                   u.name as user_name,
                   wo.title as work_order_title
            FROM stock_movements sm
            LEFT JOIN materials m ON sm.material_id = m.id
            LEFT JOIN users u ON sm.created_by = u.id
            LEFT JOIN work_orders wo ON sm.work_order_id = wo.id
            WHERE 1=1
        `;
        const params = [];

        if (material_id) {
            query += ' AND sm.material_id = ?';
            params.push(material_id);
        }
        if (type) {
            query += ' AND sm.type = ?';
            params.push(type);
        }
        if (startDate) {
            query += ' AND DATE(sm.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(sm.created_at) <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY sm.created_at DESC LIMIT 100';

        const [movements] = await pool.query(query, params);
        res.json(movements);

    } catch (error) {
        console.error('Erro ao listar movimentações:', error);
        res.status(500).json({ error: 'Erro ao listar movimentações' });
    }
};

// =====================================================
// REGISTRAR ENTRADA DE ESTOQUE
// =====================================================
exports.addStockEntry = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, quantity, unit_price, reason, notes } = req.body;

        // Verificar se material existe
        const [material] = await connection.query(
            'SELECT * FROM materials WHERE id = ?',
            [material_id]
        );

        if (material.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material não encontrado' });
        }

        const total_price = quantity * (unit_price || material[0].cost_price || 0);

        // Registrar movimentação
        const [result] = await connection.query(
            `INSERT INTO stock_movements 
             (material_id, type, quantity, unit_price, total_price, reason, notes, created_by)
             VALUES (?, 'entrada', ?, ?, ?, ?, ?, ?)`,
            [material_id, quantity, unit_price || material[0].cost_price, total_price, reason || null, notes || null, req.userId]
        );

        // Gerar código de operação
        const operationCode = await registerOperation('stock_movements', result.insertId, connection);

        await connection.query(
            'UPDATE stock_movements SET operation_code = ? WHERE id = ?',
            [operationCode, result.insertId]
        );

        // Atualizar estoque
        await connection.query(
            `UPDATE materials 
             SET current_stock = current_stock + ?,
                 cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END
             WHERE id = ?`,
            [quantity, unit_price, unit_price, material_id]
        );

        await connection.commit();

        console.log(`✅ Entrada registrada com código: ${operationCode}`);

        res.status(201).json({
            id: result.insertId,
            operationCode,
            message: 'Entrada registrada com sucesso'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar entrada:', error);
        res.status(500).json({ error: 'Erro ao registrar entrada' });
    } finally {
        connection.release();
    }
};

// =====================================================
// REGISTRAR SAÍDA DE ESTOQUE
// =====================================================
exports.addStockExit = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, quantity, reason, notes, work_order_id } = req.body;

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

        const unit_price = material[0].cost_price || 0;
        const total_price = quantity * unit_price;

        // Registrar movimentação
        const [result] = await connection.query(
            `INSERT INTO stock_movements 
             (material_id, type, quantity, unit_price, total_price, work_order_id, reason, notes, created_by)
             VALUES (?, 'saida', ?, ?, ?, ?, ?, ?, ?)`,
            [material_id, -quantity, unit_price, total_price, work_order_id || null, reason || null, notes || null, req.userId]
        );

        // Gerar código de operação
        const operationCode = await registerOperation('stock_movements', result.insertId, connection);

        await connection.query(
            'UPDATE stock_movements SET operation_code = ? WHERE id = ?',
            [operationCode, result.insertId]
        );

        // Atualizar estoque
        await connection.query(
            'UPDATE materials SET current_stock = current_stock - ? WHERE id = ?',
            [quantity, material_id]
        );

        await connection.commit();

        console.log(`✅ Saída registrada com código: ${operationCode}`);

        res.status(201).json({
            id: result.insertId,
            operationCode,
            message: 'Saída registrada com sucesso'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar saída:', error);
        res.status(500).json({ error: 'Erro ao registrar saída' });
    } finally {
        connection.release();
    }
};

// =====================================================
// REALIZAR INVENTÁRIO
// =====================================================
exports.doInventory = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, counted_quantity, notes } = req.body;

        // Buscar quantidade atual
        const [material] = await connection.query(
            'SELECT current_stock FROM materials WHERE id = ?',
            [material_id]
        );

        if (material.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material não encontrado' });
        }

        const system_quantity = material[0].current_stock;
        const difference = counted_quantity - system_quantity;

        if (difference !== 0) {
            // Registrar ajuste
            const [result] = await connection.query(
                `INSERT INTO stock_movements 
                 (material_id, type, quantity, unit_price, total_price, reason, notes, created_by)
                 VALUES (?, 'ajuste', ?, 0, 0, ?, ?, ?)`,
                [material_id, difference, `Ajuste por inventário`, notes || null, req.userId]
            );

            // Gerar código de operação
            const operationCode = await registerOperation('stock_movements', result.insertId, connection);

            await connection.query(
                'UPDATE stock_movements SET operation_code = ? WHERE id = ?',
                [operationCode, result.insertId]
            );

            // Atualizar estoque
            await connection.query(
                'UPDATE materials SET current_stock = ? WHERE id = ?',
                [counted_quantity, material_id]
            );
        }

        await connection.commit();

        res.json({
            message: difference === 0 ? 'Contagem confirmada' : 'Estoque ajustado',
            difference
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao realizar inventário:', error);
        res.status(500).json({ error: 'Erro ao realizar inventário' });
    } finally {
        connection.release();
    }
};

// =====================================================
// HISTÓRICO DO MATERIAL
// =====================================================
exports.getMaterialHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const [movements] = await pool.query(`
            SELECT sm.*, 
                   u.name as user_name,
                   wo.title as work_order_title
            FROM stock_movements sm
            LEFT JOIN users u ON sm.created_by = u.id
            LEFT JOIN work_orders wo ON sm.work_order_id = wo.id
            WHERE sm.material_id = ?
            ORDER BY sm.created_at DESC
        `, [id]);

        res.json(movements);

    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
};