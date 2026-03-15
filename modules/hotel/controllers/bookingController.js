// =====================================================
// CRIAR RESERVA COM ENTRADA
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
             AND (
                 (check_in <= ? AND check_out > ?)
                 OR (check_in < ? AND check_out >= ?)
             )`,
            [room_id, check_in, check_in, check_out, check_out]
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
        const paymentStatus = down_payment_paid ? 'entrada_paga' : 'aguardando_entrada';

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
        if (!down_payment_paid) {
            // Parcela da entrada (vence hoje)
            await connection.query(
                `INSERT INTO booking_installments 
                 (booking_id, amount, due_date, status)
                 VALUES (?, ?, CURDATE(), 'pendente')`,
                [bookingId, downPaymentAmount]
            );

            // Criar conta a receber pendente para entrada
            await connection.query(
                `INSERT INTO accounts 
                 (user_id, title, description, amount, type, status, due_date, reference_id, reference_type)
                 VALUES (?, ?, ?, ?, 'receber', 'pendente', CURDATE(), ?, 'booking_down_payment')`,
                [
                    req.userId,
                    `Entrada Reserva #${bookingId}`,
                    `Reserva para ${guest_name} - Entrada de ${down_payment_percentage}%`,
                    downPaymentAmount,
                    bookingId
                ]
            );
        } else {
            // Se entrada foi paga, registrar como paga
            await connection.query(
                `INSERT INTO booking_installments 
                 (booking_id, amount, due_date, status, payment_date, payment_method)
                 VALUES (?, ?, CURDATE(), 'pago', CURDATE(), ?)`,
                [bookingId, downPaymentAmount, payment_method]
            );

            // Criar conta a receber como paga para entrada
            await connection.query(
                `INSERT INTO accounts 
                 (user_id, title, description, amount, type, status, payment_date, reference_id, reference_type)
                 VALUES (?, ?, ?, ?, 'receber', 'pago', CURDATE(), ?, 'booking_down_payment')`,
                [
                    req.userId,
                    `Entrada Reserva #${bookingId}`,
                    `Reserva para ${guest_name} - Entrada de ${down_payment_percentage}%`,
                    downPaymentAmount,
                    bookingId
                ]
            );
        }

        // Parcela do saldo (vence no check-in)
        await connection.query(
            `INSERT INTO booking_installments 
             (booking_id, amount, due_date, status)
             VALUES (?, ?, ?, 'pendente')`,
            [bookingId, remainingAmount, check_in]
        );

        // Criar conta a receber pendente para o saldo
        await connection.query(
            `INSERT INTO accounts 
             (user_id, title, description, amount, type, status, due_date, reference_id, reference_type)
             VALUES (?, ?, ?, ?, 'receber', 'pendente', ?, ?, 'booking_balance')`,
            [
                req.userId,
                `Saldo Reserva #${bookingId}`,
                `Reserva para ${guest_name} - Período ${check_in} a ${check_out}`,
                remainingAmount,
                check_in,
                bookingId
            ]
        );

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
                    b.down_payment_amount
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

        // Atualizar conta a receber correspondente
        await connection.query(
            `UPDATE accounts 
             SET status = 'pago', payment_date = CURDATE()
             WHERE reference_id = ? AND amount = ?`,
            [installment.booking_id, installment.amount]
        );

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

// =====================================================
// BUSCAR PARCELAS DA RESERVA
// =====================================================
exports.getBookingInstallments = async (req, res) => {
    try {
        const { booking_id } = req.params;

        const [installments] = await connection.query(
            `SELECT * FROM booking_installments 
             WHERE booking_id = ?
             ORDER BY due_date ASC`,
            [booking_id]
        );

        const [booking] = await connection.query(
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