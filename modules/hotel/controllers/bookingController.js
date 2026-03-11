const pool = require('../../../config/database');

// Listar reservas
exports.getBookings = async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;
        
        let query = `
            SELECT b.*, 
                   g.name as guest_name,
                   g.document as guest_document,
                   r.room_number,
                   rt.name as room_type
            FROM bookings b
            JOIN guests g ON b.guest_id = g.id
            JOIN rooms r ON b.room_id = r.id
            JOIN room_types rt ON r.room_type_id = rt.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        
        if (startDate) {
            query += ' AND b.check_in >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND b.check_out <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY b.check_in DESC';
        
        const [bookings] = await pool.query(query, params);
        res.json(bookings);
    } catch (error) {
        console.error('Erro ao buscar reservas:', error);
        res.status(500).json({ error: 'Erro ao buscar reservas' });
    }
};

// Buscar reserva por ID
exports.getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [bookings] = await pool.query(`
            SELECT b.*, 
                   g.*,
                   r.room_number,
                   rt.name as room_type,
                   rt.base_price
            FROM bookings b
            JOIN guests g ON b.guest_id = g.id
            JOIN rooms r ON b.room_id = r.id
            JOIN room_types rt ON r.room_type_id = rt.id
            WHERE b.id = ?
        `, [id]);
        
        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Reserva não encontrada' });
        }
        
        // Buscar consumos
        const [consumptions] = await pool.query(`
            SELECT c.*, s.name as service_name
            FROM consumptions c
            LEFT JOIN services s ON c.service_id = s.id
            WHERE c.booking_id = ?
            ORDER BY c.consumption_date DESC
        `, [id]);
        
        res.json({
            ...bookings[0],
            consumptions
        });
    } catch (error) {
        console.error('Erro ao buscar reserva:', error);
        res.status(500).json({ error: 'Erro ao buscar reserva' });
    }
};

// Verificar disponibilidade
exports.checkAvailability = async (req, res) => {
    try {
        const { check_in, check_out, room_type_id } = req.query;
        
        let query = `
            SELECT r.*, rt.name as room_type, rt.base_price
            FROM rooms r
            JOIN room_types rt ON r.room_type_id = rt.id
            WHERE r.status = 'disponivel'
            AND r.id NOT IN (
                SELECT room_id FROM bookings
                WHERE status IN ('reservado', 'confirmado', 'checkin')
                AND (
                    (check_in <= ? AND check_out > ?)
                    OR (check_in < ? AND check_out >= ?)
                    OR (? BETWEEN check_in AND check_out)
                    OR (? BETWEEN check_in AND check_out)
                )
            )
        `;
        
        const params = [check_in, check_in, check_out, check_out, check_in, check_out];
        
        if (room_type_id) {
            query += ' AND r.room_type_id = ?';
            params.push(room_type_id);
        }
        
        const [rooms] = await pool.query(query, params);
        
        res.json(rooms);
    } catch (error) {
        console.error('Erro ao verificar disponibilidade:', error);
        res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
    }
};

// Criar reserva
exports.createBooking = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const {
            guest_id,
            room_id,
            check_in,
            check_out,
            adults,
            children,
            total_amount,
            observations
        } = req.body;
        
        // Verificar disponibilidade
        const [conflicts] = await connection.query(`
            SELECT id FROM bookings
            WHERE room_id = ?
            AND status IN ('reservado', 'confirmado', 'checkin')
            AND (
                (check_in <= ? AND check_out > ?)
                OR (check_in < ? AND check_out >= ?)
            )
        `, [room_id, check_in, check_in, check_out, check_out]);
        
        if (conflicts.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Apartamento não disponível para o período' });
        }
        
        // Criar reserva
        const [result] = await connection.query(`
            INSERT INTO bookings 
            (guest_id, room_id, check_in, check_out, adults, children, total_amount, observations, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reservado')
        `, [guest_id, room_id, check_in, check_out, adults, children, total_amount, observations, req.userId]);
        
        // Atualizar status do apartamento
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ?',
            ['reservado', room_id]
        );
        
        await connection.commit();
        
        res.status(201).json({
            id: result.insertId,
            message: 'Reserva criada com sucesso'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar reserva:', error);
        res.status(500).json({ error: 'Erro ao criar reserva' });
    } finally {
        connection.release();
    }
};

// Check-in
exports.checkIn = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Atualizar reserva
        await connection.query(`
            UPDATE bookings 
            SET status = 'checkin', check_in_real = NOW()
            WHERE id = ?
        `, [id]);
        
        // Buscar room_id
        const [booking] = await connection.query(
            'SELECT room_id FROM bookings WHERE id = ?',
            [id]
        );
        
        // Atualizar status do apartamento
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ?',
            ['ocupado', booking[0].room_id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Check-in realizado com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro no check-in:', error);
        res.status(500).json({ error: 'Erro ao realizar check-in' });
    } finally {
        connection.release();
    }
};

// Check-out
exports.checkOut = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { payment_method, paid_amount } = req.body;
        
        // Buscar consumos
        const [consumptions] = await connection.query(
            'SELECT SUM(total_price) as total FROM consumptions WHERE booking_id = ?',
            [id]
        );
        
        const consumptionTotal = consumptions[0].total || 0;
        
        // Atualizar reserva
        await connection.query(`
            UPDATE bookings 
            SET status = 'checkout', 
                check_out_real = NOW(),
                payment_method = ?,
                paid_amount = ?,
                payment_status = CASE 
                    WHEN ? >= total_amount + ? THEN 'pago'
                    WHEN ? > 0 THEN 'parcial'
                    ELSE 'pendente'
                END
            WHERE id = ?
        `, [payment_method, paid_amount, paid_amount, consumptionTotal, paid_amount, id]);
        
        // Buscar room_id
        const [booking] = await connection.query(
            'SELECT room_id FROM bookings WHERE id = ?',
            [id]
        );
        
        // Atualizar status do apartamento
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ?',
            ['limpeza', booking[0].room_id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Check-out realizado com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro no check-out:', error);
        res.status(500).json({ error: 'Erro ao realizar check-out' });
    } finally {
        connection.release();
    }
};

// Cancelar reserva
exports.cancelBooking = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Buscar room_id
        const [booking] = await connection.query(
            'SELECT room_id FROM bookings WHERE id = ?',
            [id]
        );
        
        // Cancelar reserva
        await connection.query(
            'UPDATE bookings SET status = ? WHERE id = ?',
            ['cancelado', id]
        );
        
        // Liberar apartamento (se não estiver ocupado)
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ? AND status = ?',
            ['disponivel', booking[0].room_id, 'reservado']
        );
        
        await connection.commit();
        
        res.json({ message: 'Reserva cancelada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao cancelar reserva:', error);
        res.status(500).json({ error: 'Erro ao cancelar reserva' });
    } finally {
        connection.release();
    }
};

// Adicionar consumo
exports.addConsumption = async (req, res) => {
    try {
        const { booking_id, description, quantity, unit_price, service_id } = req.body;
        
        const total_price = quantity * unit_price;
        
        const [result] = await pool.query(`
            INSERT INTO consumptions 
            (booking_id, description, quantity, unit_price, total_price, created_by, service_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [booking_id, description, quantity, unit_price, total_price, req.userId, service_id]);
        
        res.status(201).json({
            id: result.insertId,
            message: 'Consumo adicionado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao adicionar consumo:', error);
        res.status(500).json({ error: 'Erro ao adicionar consumo' });
    }
};