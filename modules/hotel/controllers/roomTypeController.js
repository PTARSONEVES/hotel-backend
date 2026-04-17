const pool = require('../../../config/database');

// =====================================================
// LISTAR TODOS OS TIPOS DE APARTAMENTO
// =====================================================
exports.getRoomTypes = async (req, res) => {
    try {
        const [types] = await pool.query(`
            SELECT rt.*, 
                   COUNT(r.id) as total_rooms
            FROM room_types rt
            LEFT JOIN rooms r ON rt.id = r.room_type_id
            GROUP BY rt.id
            ORDER BY rt.name
        `);
        res.json(types);
    } catch (error) {
        console.error('Erro ao buscar tipos:', error);
        res.status(500).json({ error: 'Erro ao buscar tipos de apartamento' });
    }
};

// =====================================================
// BUSCAR TIPO DE APARTAMENTO POR ID
// =====================================================
exports.getRoomTypeById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [types] = await pool.query(`
            SELECT rt.*, 
                   COUNT(r.id) as total_rooms
            FROM room_types rt
            LEFT JOIN rooms r ON rt.id = r.room_type_id
            WHERE rt.id = ?
            GROUP BY rt.id
        `, [id]);
        
        if (types.length === 0) {
            return res.status(404).json({ error: 'Tipo não encontrado' });
        }
        
        // Buscar apartamentos deste tipo
        const [rooms] = await pool.query(`
            SELECT id, room_number, floor, status
            FROM rooms
            WHERE room_type_id = ?
            ORDER BY room_number
        `, [id]);
        
        res.json({
            ...types[0],
            rooms
        });
        
    } catch (error) {
        console.error('Erro ao buscar tipo:', error);
        res.status(500).json({ error: 'Erro ao buscar tipo' });
    }
};

// =====================================================
// CRIAR NOVO TIPO DE APARTAMENTO
// =====================================================
exports.createRoomType = async (req, res) => {
    try {
        const { name, description, capacity, size_sqm, notes } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO room_types (name, description, capacity, size_sqm, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [name, description || null, capacity || 2, size_sqm || null, notes || null]
        );
        
        res.status(201).json({
            id: result.insertId,
            message: 'Tipo de apartamento criado com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao criar tipo:', error);
        res.status(500).json({ error: 'Erro ao criar tipo' });
    }
};

// =====================================================
// ATUALIZAR TIPO DE APARTAMENTO
// =====================================================
exports.updateRoomType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, capacity, size_sqm, notes } = req.body;
        
        const [existing] = await pool.query(
            'SELECT id FROM room_types WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Tipo não encontrado' });
        }
        
        await pool.query(
            `UPDATE room_types 
             SET name = ?, description = ?, capacity = ?, size_sqm = ?, notes = ?
             WHERE id = ?`,
            [name, description || null, capacity || 2, size_sqm || null, notes || null, id]
        );
        
        res.json({ message: 'Tipo atualizado com sucesso' });
        
    } catch (error) {
        console.error('Erro ao atualizar tipo:', error);
        res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }
};

// =====================================================
// EXCLUIR TIPO DE APARTAMENTO
// =====================================================
exports.deleteRoomType = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se existem apartamentos deste tipo
        const [rooms] = await pool.query(
            'SELECT id FROM rooms WHERE room_type_id = ?',
            [id]
        );
        
        if (rooms.length > 0) {
            return res.status(400).json({ 
                error: 'Não é possível excluir: existem apartamentos vinculados a este tipo' 
            });
        }
        
        await pool.query('DELETE FROM room_types WHERE id = ?', [id]);
        res.json({ message: 'Tipo excluído com sucesso' });
        
    } catch (error) {
        console.error('Erro ao deletar tipo:', error);
        res.status(500).json({ error: 'Erro ao deletar tipo' });
    }
};