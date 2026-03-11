const pool = require('../../../config/database');

// Listar todos os apartamentos
exports.getRooms = async (req, res) => {
    try {
        const [rooms] = await pool.query('SELECT * FROM vw_room_occupancy');
        res.json(rooms);
    } catch (error) {
        console.error('Erro ao buscar apartamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar apartamentos' });
    }
};

// Mapa de ocupação por andar
exports.getRoomMap = async (req, res) => {
    try {
        const [floors] = await pool.query(`
            SELECT 
                floor,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', id,
                        'number', room_number,
                        'type', room_type,
                        'status', status,
                        'price', base_price,
                        'guest', current_guest,
                        'checkout', expected_checkout
                    )
                ) as rooms
            FROM vw_room_occupancy
            GROUP BY floor
            ORDER BY floor
        `);
        
        res.json(floors);
    } catch (error) {
        console.error('Erro ao gerar mapa:', error);
        res.status(500).json({ error: 'Erro ao gerar mapa de ocupação' });
    }
};

// Buscar apartamento por ID
exports.getRoomById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rooms] = await pool.query('SELECT * FROM vw_room_occupancy WHERE id = ?', [id]);
        
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Apartamento não encontrado' });
        }
        
        res.json(rooms[0]);
    } catch (error) {
        console.error('Erro ao buscar apartamento:', error);
        res.status(500).json({ error: 'Erro ao buscar apartamento' });
    }
};

// Criar novo apartamento
exports.createRoom = async (req, res) => {
    try {
        const { room_number, floor, room_type_id, observations } = req.body;
        
        // Verificar se número já existe
        const [existing] = await pool.query(
            'SELECT id FROM rooms WHERE room_number = ?',
            [room_number]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Número de apartamento já existe' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO rooms (room_number, floor, room_type_id, observations) VALUES (?, ?, ?, ?)',
            [room_number, floor, room_type_id, observations]
        );
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Apartamento criado com sucesso' 
        });
    } catch (error) {
        console.error('Erro ao criar apartamento:', error);
        res.status(500).json({ error: 'Erro ao criar apartamento' });
    }
};

// Atualizar apartamento
exports.updateRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const { room_number, floor, room_type_id, status, observations } = req.body;
        
        // Verificar se número já existe (exceto o próprio)
        const [existing] = await pool.query(
            'SELECT id FROM rooms WHERE room_number = ? AND id != ?',
            [room_number, id]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Número de apartamento já existe' });
        }
        
        await pool.query(
            `UPDATE rooms 
             SET room_number = ?, floor = ?, room_type_id = ?, status = ?, observations = ?
             WHERE id = ?`,
            [room_number, floor, room_type_id, status, observations, id]
        );
        
        res.json({ message: 'Apartamento atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar apartamento:', error);
        res.status(500).json({ error: 'Erro ao atualizar apartamento' });
    }
};

// Atualizar status
exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await pool.query('UPDATE rooms SET status = ? WHERE id = ?', [status, id]);
        
        res.json({ message: 'Status atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
};

// Deletar apartamento
exports.deleteRoom = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se há reservas futuras
        const [bookings] = await pool.query(
            'SELECT id FROM bookings WHERE room_id = ? AND check_in > CURDATE()',
            [id]
        );
        
        if (bookings.length > 0) {
            return res.status(400).json({ 
                error: 'Não é possível deletar: existem reservas futuras' 
            });
        }
        
        await pool.query('DELETE FROM rooms WHERE id = ?', [id]);
        
        res.json({ message: 'Apartamento deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar apartamento:', error);
        res.status(500).json({ error: 'Erro ao deletar apartamento' });
    }
};