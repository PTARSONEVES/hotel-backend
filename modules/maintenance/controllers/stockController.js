const pool = require('../../../config/database');

// =====================================================
// MATERIAIS (ESTOQUE)
// =====================================================

// Listar materiais
exports.getMaterials = async (req, res) => {
    try {
        const { category_id, low_stock } = req.query;

        let query = `
            SELECT m.*, mc.name as category_name,
                   (m.min_stock - m.current_stock) as missing_stock
            FROM materials m
            LEFT JOIN material_categories mc ON m.category_id = mc.id
            WHERE 1=1
        `;
        const params = [];

        if (category_id) {
            query += ' AND m.category_id = ?';
            params.push(category_id);
        }
        if (low_stock === 'true') {
            query += ' AND m.current_stock <= m.min_stock';
        }

        query += ' ORDER BY m.current_stock <= m.min_stock DESC, m.name';

        const [materials] = await pool.query(query, params);
        res.json(materials);

    } catch (error) {
        console.error('Erro ao listar materiais:', error);
        res.status(500).json({ error: 'Erro ao listar materiais' });
    }
};

// Criar material
exports.createMaterial = async (req, res) => {
    try {
        const {
            category_id,
            code,
            name,
            description,
            unit,
            min_stock,
            max_stock,
            location,
            supplier,
            cost_price,
            selling_price
        } = req.body;

        // Verificar se código já existe
        const [existing] = await pool.query(
            'SELECT id FROM materials WHERE code = ?',
            [code]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Código já existe' });
        }

        const [result] = await pool.query(
            `INSERT INTO materials 
             (category_id, code, name, description, unit, min_stock, max_stock, 
              location, supplier, cost_price, selling_price, current_stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                category_id, code, name, description, unit, min_stock || 5,
                max_stock, location, supplier, cost_price, selling_price
            ]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Material cadastrado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar material:', error);
        res.status(500).json({ error: 'Erro ao criar material' });
    }
};

// Registrar entrada de estoque
exports.addStockEntry = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, quantity, unit_price, reason, notes } = req.body;

        // Registrar movimentação
        await connection.query(
            `INSERT INTO stock_movements 
             (material_id, type, quantity, unit_price, total_price, reason, notes, created_by)
             VALUES (?, 'entrada', ?, ?, ?, ?, ?, ?)`,
            [material_id, quantity, unit_price, quantity * unit_price, reason, notes, req.userId]
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

        res.json({ message: 'Entrada registrada com sucesso' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar entrada:', error);
        res.status(500).json({ error: 'Erro ao registrar entrada' });
    } finally {
        connection.release();
    }
};

// Registrar saída de estoque (avulso, sem OS)
exports.addStockExit = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, quantity, unit_price, reason, notes } = req.body;

        // Verificar estoque
        const [material] = await connection.query(
            'SELECT current_stock FROM materials WHERE id = ?',
            [material_id]
        );

        if (material[0].current_stock < quantity) {
            await connection.rollback();
            return res.status(400).json({ error: 'Estoque insuficiente' });
        }

        // Registrar movimentação
        await connection.query(
            `INSERT INTO stock_movements 
             (material_id, type, quantity, unit_price, total_price, reason, notes, created_by)
             VALUES (?, 'saida', ?, ?, ?, ?, ?, ?)`,
            [material_id, -quantity, unit_price, quantity * unit_price, reason, notes, req.userId]
        );

        // Atualizar estoque
        await connection.query(
            'UPDATE materials SET current_stock = current_stock - ? WHERE id = ?',
            [quantity, material_id]
        );

        await connection.commit();

        res.json({ message: 'Saída registrada com sucesso' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar saída:', error);
        res.status(500).json({ error: 'Erro ao registrar saída' });
    } finally {
        connection.release();
    }
};

// Realizar inventário (contagem física)
exports.doInventory = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { material_id, counted_quantity, notes } = req.body;

        // Buscar quantidade atual no sistema
        const [material] = await connection.query(
            'SELECT current_stock FROM materials WHERE id = ?',
            [material_id]
        );

        const system_quantity = material[0].current_stock;
        const difference = counted_quantity - system_quantity;

        // Registrar contagem
        await connection.query(
            `INSERT INTO inventory_counts 
             (material_id, counted_quantity, system_quantity, difference, notes, counted_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [material_id, counted_quantity, system_quantity, difference, notes, req.userId]
        );

        // Se houver diferença, ajustar estoque
        if (difference !== 0) {
            await connection.query(
                `INSERT INTO stock_movements 
                 (material_id, type, quantity, total_price, reason, notes, created_by)
                 VALUES (?, 'ajuste', ?, 0, ?, ?, ?)`,
                [material_id, difference, `Ajuste por inventário`, notes, req.userId]
            );

            await connection.query(
                'UPDATE materials SET current_stock = ? WHERE id = ?',
                [counted_quantity, material_id]
            );
        }

        await connection.commit();

        res.json({
            message: difference === 0 ? 'Contagem confirmada, estoque OK' : 'Estoque ajustado',
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
// CATEGORIAS DE MATERIAIS
// =====================================================

exports.getMaterialCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(
            `SELECT c.*, COUNT(m.id) as material_count
             FROM material_categories c
             LEFT JOIN materials m ON c.id = m.category_id
             GROUP BY c.id
             ORDER BY c.name`
        );
        res.json(categories);
    } catch (error) {
        console.error('Erro ao listar categorias:', error);
        res.status(500).json({ error: 'Erro ao listar categorias' });
    }
};

exports.createMaterialCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        const [result] = await pool.query(
            'INSERT INTO material_categories (name, description) VALUES (?, ?)',
            [name, description]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Categoria criada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({ error: 'Erro ao criar categoria' });
    }
};