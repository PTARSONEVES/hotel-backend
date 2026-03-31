const pool = require('../../../config/database');

// =====================================================
// LISTAR CATEGORIAS
// =====================================================
exports.getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(`
            SELECT mc.*, COUNT(m.id) as material_count
            FROM material_categories mc
            LEFT JOIN materials m ON mc.id = m.category_id
            GROUP BY mc.id
            ORDER BY mc.name
        `);
        res.json(categories);
    } catch (error) {
        console.error('Erro ao listar categorias:', error);
        res.status(500).json({ error: 'Erro ao listar categorias' });
    }
};

// =====================================================
// BUSCAR CATEGORIA POR ID
// =====================================================
exports.getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [categories] = await pool.query(`
            SELECT mc.*, COUNT(m.id) as material_count
            FROM material_categories mc
            LEFT JOIN materials m ON mc.id = m.category_id
            WHERE mc.id = ?
            GROUP BY mc.id
        `, [id]);
        
        if (categories.length === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        
        // Buscar materiais da categoria
        const [materials] = await pool.query(`
            SELECT id, name, code, unit, current_stock, min_stock
            FROM materials
            WHERE category_id = ?
            ORDER BY name
        `, [id]);
        
        res.json({
            ...categories[0],
            materials
        });
        
    } catch (error) {
        console.error('Erro ao buscar categoria:', error);
        res.status(500).json({ error: 'Erro ao buscar categoria' });
    }
};

// =====================================================
// CRIAR CATEGORIA
// =====================================================
exports.createCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO material_categories (name, description) VALUES (?, ?)',
            [name, description || null]
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

// =====================================================
// ATUALIZAR CATEGORIA
// =====================================================
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        
        const [existing] = await pool.query(
            'SELECT id FROM material_categories WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        
        await pool.query(
            'UPDATE material_categories SET name = ?, description = ? WHERE id = ?',
            [name, description || null, id]
        );
        
        res.json({ message: 'Categoria atualizada com sucesso' });
        
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
};

// =====================================================
// DELETAR CATEGORIA
// =====================================================
exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se existem materiais nesta categoria
        const [materials] = await pool.query(
            'SELECT id FROM materials WHERE category_id = ?',
            [id]
        );
        
        if (materials.length > 0) {
            return res.status(400).json({ 
                error: 'Não é possível excluir: categoria possui materiais associados' 
            });
        }
        
        await pool.query('DELETE FROM material_categories WHERE id = ?', [id]);
        res.json({ message: 'Categoria excluída com sucesso' });
        
    } catch (error) {
        console.error('Erro ao deletar categoria:', error);
        res.status(500).json({ error: 'Erro ao deletar categoria' });
    }
};