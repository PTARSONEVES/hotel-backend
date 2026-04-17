const pool = require('../../../config/database');
const { registerOperation } = require('../../../utils/codeGenerator');

// Listar todos os apartamentos
exports.getRooms = async (req, res) => {
    try {
        const [rooms] = await pool.query(`
            SELECT r.*, 
                   rt.name as room_type_name,
                   CASE 
                       WHEN b.id IS NOT NULL THEN 'ocupado'
                       ELSE r.status
                   END as current_status,
                   g.name as current_guest,
                   b.check_out,
                   (SELECT COUNT(*) FROM work_orders WHERE room_id = r.id AND status IN ('aberta', 'em_andamento')) as open_orders
            FROM rooms r
            LEFT JOIN room_types rt ON r.room_type_id = rt.id
            LEFT JOIN bookings b ON r.id = b.room_id 
                AND b.status = 'checkin'
                AND CURDATE() BETWEEN b.check_in AND b.check_out
            LEFT JOIN guests g ON b.guest_id = g.id
            ORDER BY r.block, r.room_number
        `);
        
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
        
        const [rooms] = await pool.query(`
            SELECT r.*, rt.name as room_type_name, rt.capacity, rt.size_sqm
            FROM rooms r
            LEFT JOIN room_types rt ON r.room_type_id = rt.id
            WHERE r.id = ?
        `, [id]);
        
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Apartamento não encontrado' });
        }
        
        // Buscar histórico de manutenção
        const [maintenance] = await pool.query(`
            SELECT wo.*, u.name as technician_name
            FROM work_orders wo
            LEFT JOIN users u ON wo.assigned_to = u.id
            WHERE wo.room_id = ?
            ORDER BY wo.created_at DESC
            LIMIT 10
        `, [id]);
        
        res.json({
            ...rooms[0],
            maintenance_history: maintenance
        });
        
    } catch (error) {
        console.error('Erro ao buscar apartamento:', error);
        res.status(500).json({ error: 'Erro ao buscar apartamento' });
    }
};

// =====================================================
// CRIAR APARTAMENTO (COM CÓDIGO DE OPERAÇÃO)
// =====================================================
exports.createRoom = async (req, res) => {
    try {
        const {
            room_number,
            floor,
            room_type_id,
            block,
            ownership,
            observations,
            maintenance_notes
        } = req.body;
        
        console.log('📝 Criando apartamento:', { room_number, floor, block });
        
        // Verificar se número já existe
        const [existing] = await pool.query(
            'SELECT id FROM rooms WHERE room_number = ?',
            [room_number]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Número de apartamento já existe' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO rooms 
             (room_number, floor, room_type_id, block, ownership, observations, maintenance_notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'disponivel')`,
            [room_number, floor, room_type_id, block || null, ownership || 'proprio', observations || null, maintenance_notes || null]
        );
        
        const roomId = result.insertId;
        
        // =====================================================
        // GERAR CÓDIGO DE OPERAÇÃO
        // =====================================================
        let operationCode = null;
        try {
            operationCode = await registerOperation('rooms', roomId, pool);
            await pool.query(
                'UPDATE rooms SET operation_code = ? WHERE id = ?',
                [operationCode, roomId]
            );
            console.log(`✅ Código gerado para apartamento: ${operationCode}`);
        } catch (error) {
            console.error('❌ Erro ao gerar código:', error);
            // Não impede a criação do apartamento
        }
        
        res.status(201).json({ 
            id: roomId,
            operationCode,
            message: 'Apartamento criado com sucesso' 
        });
        
    } catch (error) {
        console.error('Erro ao criar apartamento:', error);
        res.status(500).json({ error: 'Erro ao criar apartamento' });
    }
};

// =====================================================
// ATUALIZAR APARTAMENTO
// =====================================================
exports.updateRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            room_number,
            floor,
            room_type_id,
            block,
            ownership,
            status,
            observations,
            maintenance_notes
        } = req.body;
        
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
             SET room_number = ?, floor = ?, room_type_id = ?, block = ?, 
                 ownership = ?, status = ?, observations = ?, maintenance_notes = ?
             WHERE id = ?`,
            [room_number, floor, room_type_id, block || null, ownership || 'proprio', 
             status, observations || null, maintenance_notes || null, id]
        );
        
        res.json({ message: 'Apartamento atualizado com sucesso' });
        
    } catch (error) {
        console.error('Erro ao atualizar apartamento:', error);
        res.status(500).json({ error: 'Erro ao atualizar apartamento' });
    }
};

// =====================================================
// BUSCAR APARTAMENTO POR CÓDIGO (adicional)
// =====================================================
exports.getRoomByCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        const [rooms] = await pool.query(`
            SELECT r.*, rt.name as room_type_name
            FROM rooms r
            LEFT JOIN room_types rt ON r.room_type_id = rt.id
            WHERE r.operation_code = ?
        `, [code]);
        
        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Apartamento não encontrado' });
        }
        
        res.json(rooms[0]);
        
    } catch (error) {
        console.error('Erro ao buscar apartamento por código:', error);
        res.status(500).json({ error: 'Erro ao buscar apartamento' });
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