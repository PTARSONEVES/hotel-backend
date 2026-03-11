const pool = require('../../../config/database');

// Listar todos os hóspedes
exports.getGuests = async (req, res) => {
    try {
        const [guests] = await pool.query(`
            SELECT g.*, 
                   COUNT(b.id) as total_bookings,
                   MAX(b.check_in) as last_visit
            FROM guests g
            LEFT JOIN bookings b ON g.id = b.guest_id
            GROUP BY g.id
            ORDER BY g.created_at DESC
        `);
        res.json(guests);
    } catch (error) {
        console.error('Erro ao buscar hóspedes:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspedes' });
    }
};

// Buscar hóspede por ID
exports.getGuestById = async (req, res) => {
    try {
        const { id } = req.params;
        const [guests] = await pool.query('SELECT * FROM guests WHERE id = ?', [id]);
        
        if (guests.length === 0) {
            return res.status(404).json({ error: 'Hóspede não encontrado' });
        }
        
        // Buscar histórico de reservas
        const [bookings] = await pool.query(`
            SELECT b.*, r.room_number, rt.name as room_type
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            JOIN room_types rt ON r.room_type_id = rt.id
            WHERE b.guest_id = ?
            ORDER BY b.check_in DESC
        `, [id]);
        
        res.json({
            ...guests[0],
            bookings
        });
    } catch (error) {
        console.error('Erro ao buscar hóspede:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspede' });
    }
};

// Criar novo hóspede
exports.createGuest = async (req, res) => {
    try {
        const { name, document, email, phone, address, city, state, country } = req.body;
        
        // Verificar se documento já existe
        const [existing] = await pool.query(
            'SELECT id FROM guests WHERE document = ?',
            [document]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Documento já cadastrado' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO guests (name, document, email, phone, address, city, state, country)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, document, email, phone, address, city, state, country || 'Brasil']
        );
        
        res.status(201).json({
            id: result.insertId,
            message: 'Hóspede cadastrado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar hóspede:', error);
        res.status(500).json({ error: 'Erro ao criar hóspede' });
    }
};

// Atualizar hóspede
exports.updateGuest = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, address, city, state, country } = req.body;
        
        await pool.query(
            `UPDATE guests 
             SET name = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, country = ?
             WHERE id = ?`,
            [name, email, phone, address, city, state, country, id]
        );
        
        res.json({ message: 'Hóspede atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar hóspede:', error);
        res.status(500).json({ error: 'Erro ao atualizar hóspede' });
    }
};

// Deletar hóspede
exports.deleteGuest = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se há reservas
        const [bookings] = await pool.query(
            'SELECT id FROM bookings WHERE guest_id = ?',
            [id]
        );
        
        if (bookings.length > 0) {
            return res.status(400).json({
                error: 'Não é possível excluir: hóspede possui histórico de reservas'
            });
        }
        
        await pool.query('DELETE FROM guests WHERE id = ?', [id]);
        res.json({ message: 'Hóspede excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar hóspede:', error);
        res.status(500).json({ error: 'Erro ao deletar hóspede' });
    }
};

// Buscar hóspede por documento (para check-in rápido)
exports.getGuestByDocument = async (req, res) => {
    try {
        const { document } = req.params;
        const [guests] = await pool.query('SELECT * FROM guests WHERE document = ?', [document]);
        
        if (guests.length === 0) {
            return res.status(404).json({ error: 'Hóspede não encontrado' });
        }
        
        res.json(guests[0]);
    } catch (error) {
        console.error('Erro ao buscar hóspede:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspede' });
    }
};