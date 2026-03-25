const pool = require('../../../config/database');

// =====================================================
// LISTAR RESERVAS
// =====================================================
exports.getBookings = async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;

        let query = `
            SELECT b.*, 
                   g.name as guest_name,
                   g.document as guest_document,
                   r.room_number,
                   rt.name as room_type,
                   (SELECT SUM(total_price) FROM consumptions WHERE booking_id = b.id) as consumption_total
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

// =====================================================
// BUSCAR RESERVA POR ID
// =====================================================
exports.getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [bookings] = await pool.query(`
            SELECT b.*, 
                   g.name as guest_name,
                   g.document as guest_document,
                   g.phone as guest_phone,
                   g.email as guest_email,
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
        
        // Buscar parcelas
        const [installments] = await pool.query(`
            SELECT * FROM booking_installments 
            WHERE booking_id = ?
            ORDER BY due_date ASC
        `, [id]);
        
        res.json({
            ...bookings[0],
            consumptions,
            installments
        });
        
    } catch (error) {
        console.error('Erro ao buscar reserva:', error);
        res.status(500).json({ error: 'Erro ao buscar reserva' });
    }
};

// =====================================================
// VERIFICAR DISPONIBILIDADE
// =====================================================
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
                AND NOT (check_out <= ? OR check_in >= ?)
            )
        `;
        
        const params = [check_in, check_out];
        
        if (room_type_id) {
            query += ' AND r.room_type_id = ?';
            params.push(room_type_id);
        }
        
        query += ' ORDER BY r.room_number';
        
        const [rooms] = await pool.query(query, params);
        res.json(rooms);
        
    } catch (error) {
        console.error('Erro ao verificar disponibilidade:', error);
        res.status(500).json({ error: 'Erro ao verificar disponibilidade' });
    }
};

// =====================================================
// CRIAR RESERVA (COM PAYMENT_STATUS CORRETO)
// =====================================================
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
            down_payment_percentage = 50,
            down_payment_paid = false,
            payment_method = 'pix',
            observations
        } = req.body;
        
        // Verificar disponibilidade
        const [conflicts] = await connection.query(
            `SELECT id FROM bookings
             WHERE room_id = ?
             AND status IN ('reservado', 'confirmado', 'checkin')
             AND NOT (check_out <= ? OR check_in >= ?)`,
            [room_id, check_in, check_out]
        );
        
        if (conflicts.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Apartamento não disponível para o período' });
        }
        
        // Buscar nome do hóspede
        const [guest] = await connection.query('SELECT name FROM guests WHERE id = ?', [guest_id]);
        const guest_name = guest[0]?.name || 'Hóspede';
        
        // Calcular valores
        const downPaymentAmount = (total_amount * down_payment_percentage) / 100;
        const remainingAmount = total_amount - downPaymentAmount;
        
        // Determinar status da reserva
        const bookingStatus = down_payment_paid ? 'confirmado' : 'reservado';
        
        // CORREÇÃO: Payment Status válido
        let paymentStatus;
        if (down_payment_paid) {
            paymentStatus = 'entrada_paga';
        } else if (down_payment_percentage === 100) {
            paymentStatus = 'quitado';
        } else if (down_payment_percentage > 0) {
            paymentStatus = 'parcial';
        } else {
            paymentStatus = 'aguardando_entrada';
        }
        
        // Criar reserva
        const [result] = await connection.query(
            `INSERT INTO bookings 
             (guest_id, room_id, check_in, check_out, adults, children, 
              total_amount, down_payment_percentage, down_payment_amount, 
              remaining_amount, payment_status, status, observations, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                guest_id, room_id, check_in, check_out, adults, children,
                total_amount, down_payment_percentage, downPaymentAmount,
                remainingAmount, paymentStatus, bookingStatus, observations, req.userId
            ]
        );
        
        const bookingId = result.insertId;
        
        // Criar parcelas
        if (!down_payment_paid && downPaymentAmount > 0) {
            await connection.query(
                `INSERT INTO booking_installments 
                 (booking_id, amount, due_date, status)
                 VALUES (?, ?, CURDATE(), 'pendente')`,
                [bookingId, downPaymentAmount]
            );
        } else if (down_payment_paid && downPaymentAmount > 0) {
            await connection.query(
                `INSERT INTO booking_installments 
                 (booking_id, amount, due_date, status, payment_date, payment_method)
                 VALUES (?, ?, CURDATE(), 'pago', CURDATE(), ?)`,
                [bookingId, downPaymentAmount, payment_method]
            );
        }
        
        // Parcela do saldo (vence no check-in)
        if (remainingAmount > 0) {
            await connection.query(
                `INSERT INTO booking_installments 
                 (booking_id, amount, due_date, status)
                 VALUES (?, ?, ?, 'pendente')`,
                [bookingId, remainingAmount, check_in]
            );
        }
        
        // Atualizar status do apartamento
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ?',
            ['reservado', room_id]
        );
        
        await connection.commit();
        
        res.status(201).json({
            id: bookingId,
            message: 'Reserva criada com sucesso',
            payment: {
                down_payment: downPaymentAmount,
                remaining: remainingAmount,
                total: total_amount,
                status: paymentStatus
            }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar reserva:', error);
        res.status(500).json({ error: 'Erro ao criar reserva: ' + error.message });
    } finally {
        connection.release();
    }
};

// =====================================================
// ATUALIZAR RESERVA
// =====================================================
exports.updateBooking = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const {
            check_in,
            check_out,
            adults,
            children,
            total_amount,
            observations
        } = req.body;
        
        // Verificar se a reserva existe
        const [existing] = await connection.query(
            'SELECT room_id, status FROM bookings WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Reserva não encontrada' });
        }
        
        const booking = existing[0];
        
        // Se as datas mudaram, verificar disponibilidade novamente
        if (check_in || check_out) {
            const newCheckIn = check_in || booking.check_in;
            const newCheckOut = check_out || booking.check_out;
            
            const [conflicts] = await connection.query(
                `SELECT id FROM bookings
                 WHERE room_id = ?
                 AND id != ?
                 AND status IN ('reservado', 'confirmado', 'checkin')
                 AND NOT (check_out <= ? OR check_in >= ?)`,
                [booking.room_id, id, newCheckIn, newCheckOut]
            );
            
            if (conflicts.length > 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Período não disponível' });
            }
        }
        
        // Atualizar reserva
        await connection.query(
            `UPDATE bookings 
             SET check_in = COALESCE(?, check_in),
                 check_out = COALESCE(?, check_out),
                 adults = COALESCE(?, adults),
                 children = COALESCE(?, children),
                 total_amount = COALESCE(?, total_amount),
                 observations = COALESCE(?, observations)
             WHERE id = ?`,
            [check_in, check_out, adults, children, total_amount, observations, id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Reserva atualizada com sucesso' });
        
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao atualizar reserva:', error);
        res.status(500).json({ error: 'Erro ao atualizar reserva' });
    } finally {
        connection.release();
    }
};

// =====================================================
// CHECK-IN
// =====================================================
exports.checkIn = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Buscar reserva
        const [booking] = await connection.query(
            'SELECT room_id, status FROM bookings WHERE id = ?',
            [id]
        );
        
        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Reserva não encontrada' });
        }
        
        if (booking[0].status !== 'confirmado' && booking[0].status !== 'reservado') {
            await connection.rollback();
            return res.status(400).json({ error: 'Reserva não pode fazer check-in' });
        }
        
        // Atualizar reserva
        await connection.query(
            `UPDATE bookings 
             SET status = 'checkin', check_in_real = NOW()
             WHERE id = ?`,
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

// =====================================================
// CHECK-OUT
// =====================================================
exports.checkOut = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { payment_method, paid_amount } = req.body;
        
        // Buscar reserva
        const [booking] = await connection.query(
            'SELECT room_id, total_amount, down_payment_amount, remaining_amount FROM bookings WHERE id = ?',
            [id]
        );
        
        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Reserva não encontrada' });
        }
        
        // Buscar consumos
        const [consumptions] = await connection.query(
            'SELECT SUM(total_price) as total FROM consumptions WHERE booking_id = ?',
            [id]
        );
        
        const consumptionTotal = consumptions[0]?.total || 0;
        const totalAmount = parseFloat(booking[0].total_amount) + consumptionTotal;
        
        // Atualizar reserva
        await connection.query(
            `UPDATE bookings 
             SET status = 'checkout', 
                 check_out_real = NOW(),
                 payment_method = ?,
                 paid_amount = ?,
                 payment_status = CASE 
                     WHEN ? >= total_amount + ? THEN 'pago'
                     WHEN ? > 0 THEN 'parcial'
                     ELSE 'pendente'
                 END
             WHERE id = ?`,
            [payment_method, paid_amount, paid_amount, consumptionTotal, paid_amount, id]
        );
        
        // Atualizar status do apartamento
        await connection.query(
            'UPDATE rooms SET status = ? WHERE id = ?',
            ['limpeza', booking[0].room_id]
        );
        
        await connection.commit();
        
        res.json({ 
            message: 'Check-out realizado com sucesso',
            total: totalAmount,
            consumption: consumptionTotal
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Erro no check-out:', error);
        res.status(500).json({ error: 'Erro ao realizar check-out' });
    } finally {
        connection.release();
    }
};

// =====================================================
// CANCELAR RESERVA
// =====================================================
exports.cancelBooking = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        
        // Buscar room_id
        const [booking] = await connection.query(
            'SELECT room_id, status FROM bookings WHERE id = ?',
            [id]
        );
        
        if (booking.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Reserva não encontrada' });
        }
        
        if (booking[0].status === 'checkin' || booking[0].status === 'checkout') {
            await connection.rollback();
            return res.status(400).json({ error: 'Não é possível cancelar uma reserva em andamento' });
        }
        
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

// =====================================================
// ADICIONAR CONSUMO
// =====================================================
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

// =====================================================
// BUSCAR PARCELAS DA RESERVA
// =====================================================
exports.getBookingInstallments = async (req, res) => {
    try {
        const { booking_id } = req.params;
        
        const [installments] = await pool.query(
            `SELECT * FROM booking_installments 
             WHERE booking_id = ?
             ORDER BY due_date ASC`,
            [booking_id]
        );
        
        const [booking] = await pool.query(
            `SELECT total_amount, down_payment_amount, remaining_amount, 
                    payment_status, status, guest_name
             FROM bookings WHERE id = ?`,
            [booking_id]
        );
        
        res.json({
            booking: booking[0],
            installments
        });
        
    } catch (error) {
        console.error('Erro ao buscar parcelas:', error);
        res.status(500).json({ error: 'Erro ao buscar parcelas' });
    }
};

// =====================================================
// REGISTRAR PAGAMENTO DE PARCELA
// =====================================================
exports.payInstallment = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { installment_id } = req.params;
        const { payment_method } = req.body;
        
        // Buscar parcela
        const [installments] = await connection.query(
            `SELECT i.*, b.id as booking_id, b.guest_name, b.total_amount,
                    b.down_payment_amount, b.remaining_amount
             FROM booking_installments i
             JOIN bookings b ON i.booking_id = b.id
             WHERE i.id = ?`,
            [installment_id]
        );
        
        if (installments.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Parcela não encontrada' });
        }
        
        const installment = installments[0];
        
        // Atualizar parcela
        await connection.query(
            `UPDATE booking_installments 
             SET status = 'pago', payment_date = CURDATE(), payment_method = ?
             WHERE id = ?`,
            [payment_method, installment_id]
        );
        
        // Verificar se todas as parcelas estão pagas
        const [pending] = await connection.query(
            'SELECT COUNT(*) as total FROM booking_installments WHERE booking_id = ? AND status != "pago"',
            [installment.booking_id]
        );
        
        if (pending[0].total === 0) {
            await connection.query(
                'UPDATE bookings SET payment_status = ? WHERE id = ?',
                ['quitado', installment.booking_id]
            );
        } else if (installment.amount === installment.down_payment_amount) {
            await connection.query(
                'UPDATE bookings SET payment_status = ? WHERE id = ?',
                ['entrada_paga', installment.booking_id]
            );
        }
        
        await connection.commit();
        
        res.json({ 
            message: 'Pagamento registrado com sucesso',
            booking_id: installment.booking_id
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar pagamento:', error);
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
    } finally {
        connection.release();
    }
};