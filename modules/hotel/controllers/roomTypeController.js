const pool = require('../../../config/database');

// Listar todos os tipos de apartamento
exports.getRoomTypes = async (req, res) => {
    try {
        const [types] = await pool.query('SELECT * FROM room_types ORDER BY base_price');
        res.json(types);
    } catch (error) {
        console.error('Erro ao buscar tipos:', error);
        res.status(500).json({ error: 'Erro ao buscar tipos de apartamento' });
    }
};

// Criar novo tipo
exports.createRoomType = async (req, res) => {
    try {
        const { name, description, base_price, capacity, size_sqm } = req.body;
        
        const [result] = await pool.query(
            'INSERT INTO room_types (name, description, base_price, capacity, size_sqm) VALUES (?, ?, ?, ?, ?)',
            [name, description, base_price, capacity, size_sqm]
        );
        
        res.status(201).json({ 
            id: result.insertId, 
            message: 'Tipo de apartamento criado com sucesso' 
        });
    } catch (error) {
        console.error('Erro ao criar tipo:', error);
        res.status(500).json({ error: 'Erro ao criar tipo de apartamento' });
    }
};

// Atualizar tipo
exports.updateRoomType = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, base_price, capacity, size_sqm } = req.body;
        
        await pool.query(
            'UPDATE room_types SET name = ?, description = ?, base_price = ?, capacity = ?, size_sqm = ? WHERE id = ?',
            [name, description, base_price, capacity, size_sqm, id]
        );
        
        res.json({ message: 'Tipo atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar tipo:', error);
        res.status(500).json({ error: 'Erro ao atualizar tipo' });
    }
};

// Deletar tipo
exports.deleteRoomType = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se existem apartamentos deste tipo
        const [rooms] = await pool.query('SELECT id FROM rooms WHERE room_type_id = ?', [id]);
        
        if (rooms.length > 0) {
            return res.status(400).json({ 
                error: 'Não é possível deletar: existem apartamentos deste tipo' 
            });
        }
        
        await pool.query('DELETE FROM room_types WHERE id = ?', [id]);
        res.json({ message: 'Tipo deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar tipo:', error);
        res.status(500).json({ error: 'Erro ao deletar tipo' });
    }
};