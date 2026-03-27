const pool = require('../../../config/database');
const { registerOperation, parseOperationCode } = require('../../../utils/codeGenerator');

// =====================================================
// LISTAR HÓSPEDES
// =====================================================
exports.getGuests = async (req, res) => {
    try {
        const { code } = req.query;
        
        let query = `
            SELECT g.*, 
                   COUNT(b.id) as total_bookings,
                   MAX(b.check_in) as last_visit
            FROM guests g
            LEFT JOIN bookings b ON g.id = b.guest_id
        `;
        
        const params = [];
        
        // Filtro por código (opcional)
        if (code) {
            query += ` WHERE g.operation_code = ?`;
            params.push(code);
        }
        
        query += ` GROUP BY g.id
                   ORDER BY g.created_at DESC`;
        
        const [guests] = await pool.query(query, params);
        res.json(guests);
        
    } catch (error) {
        console.error('Erro ao buscar hóspedes:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspedes' });
    }
};

// =====================================================
// BUSCAR HÓSPEDE POR ID
// =====================================================
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
        
        // Analisar código de operação
        let codeInfo = null;
        if (guests[0].operation_code) {
            codeInfo = await parseOperationCode(guests[0].operation_code);
        }
        
        res.json({
            ...guests[0],
            bookings,
            codeInfo
        });
    } catch (error) {
        console.error('Erro ao buscar hóspede:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspede' });
    }
};

// =====================================================
// BUSCAR HÓSPEDE POR CÓDIGO DE OPERAÇÃO
// =====================================================
exports.getGuestByOperationCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        const [guests] = await pool.query(
            'SELECT * FROM guests WHERE operation_code = ?',
            [code]
        );
        
        if (guests.length === 0) {
            return res.status(404).json({ error: 'Hóspede não encontrado' });
        }
        
        const codeInfo = await parseOperationCode(code);
        
        res.json({
            guest: guests[0],
            codeInfo
        });
    } catch (error) {
        console.error('Erro ao buscar hóspede por código:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspede' });
    }
};

// =====================================================
// BUSCAR HÓSPEDE POR USER_ID
// =====================================================
exports.getGuestByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [guests] = await pool.query(
            'SELECT * FROM guests WHERE user_id = ?',
            [userId]
        );
        
        if (guests.length === 0) {
            return res.status(404).json({ error: 'Hóspede não encontrado para este usuário' });
        }
        
        res.json(guests[0]);
    } catch (error) {
        console.error('Erro ao buscar hóspede por user_id:', error);
        res.status(500).json({ error: 'Erro ao buscar hóspede' });
    }
};

// =====================================================
// CRIAR HÓSPEDE (COM CÓDIGO DE OPERAÇÃO)
// =====================================================
exports.createGuest = async (req, res) => {
    try {
        const { name, document, email, phone, address, city, state, country, user_id } = req.body;
        
        console.log('📝 Criando hóspede:', { name, email });
        
        // Verificar se documento já existe
        const [existing] = await pool.query(
            'SELECT id FROM guests WHERE document = ?',
            [document]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Documento já cadastrado' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO guests 
             (name, document, email, phone, address, city, state, country, user_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [name, document, email, phone, address, city, state, country || 'Brasil', user_id || null]
        );
        
        const guestId = result.insertId;
        
        // Gerar e registrar código de operação
        const operationCode = await registerOperation('guests', guestId, pool);
        
        // Atualizar o registro com o código
        await pool.query(
            'UPDATE guests SET operation_code = ? WHERE id = ?',
            [operationCode, guestId]
        );
        
        console.log(`✅ Hóspede criado com código: ${operationCode}`);
        
        res.status(201).json({
            id: guestId,
            operationCode,
            message: 'Hóspede cadastrado com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao criar hóspede:', error);
        res.status(500).json({ error: 'Erro ao criar hóspede' });
    }
};

// =====================================================
// ATUALIZAR HÓSPEDE
// =====================================================
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

// =====================================================
// DELETAR HÓSPEDE
// =====================================================
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

// =====================================================
// BUSCAR HÓSPEDE POR DOCUMENTO
// =====================================================
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