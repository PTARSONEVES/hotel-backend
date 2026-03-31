const pool = require('../../../config/database');
const { registerOperation } = require('../../../utils/codeGenerator');

// =====================================================
// LISTAR MATERIAIS
// =====================================================
exports.getMaterials = async (req, res) => {
    try {
        const { category_id, low_stock, code } = req.query;

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
        if (code) {
            query += ' AND m.operation_code = ?';
            params.push(code);
        }

        query += ' ORDER BY m.current_stock <= m.min_stock DESC, m.name';

        const [materials] = await pool.query(query, params);
        res.json(materials);

    } catch (error) {
        console.error('Erro ao listar materiais:', error);
        res.status(500).json({ error: 'Erro ao listar materiais' });
    }
};

// =====================================================
// BUSCAR MATERIAL POR ID
// =====================================================
exports.getMaterialById = async (req, res) => {
    try {
        const { id } = req.params;

        const [materials] = await pool.query(`
            SELECT m.*, mc.name as category_name
            FROM materials m
            LEFT JOIN material_categories mc ON m.category_id = mc.id
            WHERE m.id = ?
        `, [id]);

        if (materials.length === 0) {
            return res.status(404).json({ error: 'Material não encontrado' });
        }

        // Buscar movimentações
        const [movements] = await pool.query(`
            SELECT sm.*, u.name as user_name
            FROM stock_movements sm
            LEFT JOIN users u ON sm.created_by = u.id
            WHERE sm.material_id = ?
            ORDER BY sm.created_at DESC
            LIMIT 20
        `, [id]);

        res.json({
            ...materials[0],
            movements
        });

    } catch (error) {
        console.error('Erro ao buscar material:', error);
        res.status(500).json({ error: 'Erro ao buscar material' });
    }
};

// =====================================================
// BUSCAR MATERIAL POR CÓDIGO
// =====================================================
exports.getMaterialByCode = async (req, res) => {
    try {
        const { code } = req.params;

        const [materials] = await pool.query(`
            SELECT m.*, mc.name as category_name
            FROM materials m
            LEFT JOIN material_categories mc ON m.category_id = mc.id
            WHERE m.operation_code = ?
        `, [code]);

        if (materials.length === 0) {
            return res.status(404).json({ error: 'Material não encontrado' });
        }

        res.json(materials[0]);

    } catch (error) {
        console.error('Erro ao buscar material por código:', error);
        res.status(500).json({ error: 'Erro ao buscar material' });
    }
};

// =====================================================
// CRIAR MATERIAL
// =====================================================
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
              location, supplier, cost_price, selling_price, current_stock, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
                category_id, code, name, description || null, unit,
                min_stock || 5, max_stock || null,
                location || null, supplier || null,
                cost_price || 0, selling_price || 0,
                req.userId
            ]
        );

        const materialId = result.insertId;

        // Gerar código de operação
        const operationCode = await registerOperation('materials', materialId, pool);

        await pool.query(
            'UPDATE materials SET operation_code = ? WHERE id = ?',
            [operationCode, materialId]
        );

        console.log(`✅ Material criado com código: ${operationCode}`);

        res.status(201).json({
            id: materialId,
            operationCode,
            message: 'Material cadastrado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar material:', error);
        res.status(500).json({ error: 'Erro ao criar material' });
    }
};

// =====================================================
// ATUALIZAR MATERIAL
// =====================================================
exports.updateMaterial = async (req, res) => {
    try {
        const { id } = req.params;
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

        // Verificar se código já existe (exceto o próprio)
        const [existing] = await pool.query(
            'SELECT id FROM materials WHERE code = ? AND id != ?',
            [code, id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Código já existe' });
        }

        await pool.query(
            `UPDATE materials 
             SET category_id = ?, code = ?, name = ?, description = ?, unit = ?,
                 min_stock = ?, max_stock = ?, location = ?, supplier = ?,
                 cost_price = ?, selling_price = ?
             WHERE id = ?`,
            [
                category_id, code, name, description || null, unit,
                min_stock || 5, max_stock || null,
                location || null, supplier || null,
                cost_price || 0, selling_price || 0,
                id
            ]
        );

        res.json({ message: 'Material atualizado com sucesso' });

    } catch (error) {
        console.error('Erro ao atualizar material:', error);
        res.status(500).json({ error: 'Erro ao atualizar material' });
    }
};

// =====================================================
// DELETAR MATERIAL
// =====================================================
exports.deleteMaterial = async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se há movimentações
        const [movements] = await pool.query(
            'SELECT id FROM stock_movements WHERE material_id = ?',
            [id]
        );

        if (movements.length > 0) {
            return res.status(400).json({ error: 'Material possui movimentações' });
        }

        await pool.query('DELETE FROM materials WHERE id = ?', [id]);
        res.json({ message: 'Material excluído com sucesso' });

    } catch (error) {
        console.error('Erro ao deletar material:', error);
        res.status(500).json({ error: 'Erro ao deletar material' });
    }
};