const pool = require('../../../config/database');

// =====================================================
// GERAR ALERTAS DE CHECK-IN PRÓXIMO (5 DIAS)
// =====================================================
exports.generateUpcomingCheckinAlerts = async () => {
    try {
        const [bookings] = await pool.query(
            `SELECT b.*, r.room_number, g.name as guest_name,
                    COALESCE(
                        (SELECT SUM(amount) FROM booking_installments 
                         WHERE booking_id = b.id AND status = 'pendente'), 
                        0
                    ) as pending_amount
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN guests g ON b.guest_id = g.id
             WHERE b.check_in BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 5 DAY)
               AND b.status IN ('reservado', 'confirmado')
               AND b.payment_status != 'quitado'
               AND NOT EXISTS (
                   SELECT 1 FROM alerts 
                   WHERE booking_id = b.id 
                   AND type = 'upcoming_checkin' 
                   AND status = 'active'
               )`
        );

        for (const booking of bookings) {
            const message = `🔔 Check-in em ${new Date(booking.check_in).toLocaleDateString('pt-BR')}: ` +
                `Apartamento ${booking.room_number} - ${booking.guest_name} | ` +
                `Saldo pendente: R$ ${parseFloat(booking.pending_amount || 0).toFixed(2)}`;

            await pool.query(
                `INSERT INTO alerts (type, booking_id, message, priority)
                 VALUES ('upcoming_checkin', ?, ?, ?)`,
                [booking.id, message, booking.pending_amount > 0 ? 'alta' : 'media']
            );
        }

        return bookings.length;
    } catch (error) {
        console.error('❌ Erro ao gerar alertas de check-in:', error);
        throw error;
    }
};

// =====================================================
// GERAR ALERTAS DE CHECK-IN VENCIDO
// =====================================================
exports.generateOverdueCheckinAlerts = async () => {
    try {
        const [bookings] = await pool.query(
            `SELECT b.*, r.room_number, g.name as guest_name,
                    COALESCE(
                        (SELECT SUM(amount) FROM booking_installments 
                         WHERE booking_id = b.id AND status = 'pendente'), 
                        0
                    ) as pending_amount,
                    DATEDIFF(CURDATE(), b.check_in) as days_overdue
             FROM bookings b
             JOIN rooms r ON b.room_id = r.id
             JOIN guests g ON b.guest_id = g.id
             WHERE b.check_in < CURDATE()
               AND b.status IN ('reservado', 'confirmado')
               AND b.payment_status != 'quitado'
               AND NOT EXISTS (
                   SELECT 1 FROM alerts 
                   WHERE booking_id = b.id 
                   AND type = 'overdue_checkin' 
                   AND status = 'active'
               )`
        );

        for (const booking of bookings) {
            const message = `🚨 CHECK-IN ATRASADO (${booking.days_overdue} dias): ` +
                `Apartamento ${booking.room_number} - ${booking.guest_name} | ` +
                `Check-in era em ${new Date(booking.check_in).toLocaleDateString('pt-BR')} | ` +
                `Saldo pendente: R$ ${parseFloat(booking.pending_amount || 0).toFixed(2)}`;

            await pool.query(
                `INSERT INTO alerts (type, booking_id, message, priority)
                 VALUES ('overdue_checkin', ?, ?, 'urgente')`,
                [booking.id, message]
            );
        }

        return bookings.length;
    } catch (error) {
        console.error('❌ Erro ao gerar alertas de check-in atrasado:', error);
        throw error;
    }
};

// =====================================================
// GERAR ALERTAS DE PAGAMENTO ATRASADO
// =====================================================
exports.generateOverduePaymentAlerts = async () => {
    try {
        const [installments] = await pool.query(
            `SELECT i.*, b.id as booking_id, b.guest_name, b.check_in,
                    r.room_number,
                    DATEDIFF(CURDATE(), i.due_date) as days_overdue
             FROM booking_installments i
             JOIN bookings b ON i.booking_id = b.id
             JOIN rooms r ON b.room_id = r.id
             WHERE i.due_date < CURDATE()
               AND i.status = 'pendente'
               AND NOT EXISTS (
                   SELECT 1 FROM alerts 
                   WHERE booking_id = i.booking_id 
                   AND type = 'overdue_payment' 
                   AND status = 'active'
               )`
        );

        for (const inst of installments) {
            const message = `💰 PAGAMENTO ATRASADO (${inst.days_overdue} dias): ` +
                `Reserva para ${inst.guest_name} - Apt ${inst.room_number} | ` +
                `Parcela de R$ ${parseFloat(inst.amount).toFixed(2)} vencida em ${new Date(inst.due_date).toLocaleDateString('pt-BR')}`;

            await pool.query(
                `INSERT INTO alerts (type, booking_id, message, priority)
                 VALUES ('overdue_payment', ?, ?, 'alta')`,
                [inst.booking_id, message]
            );
        }

        return installments.length;
    } catch (error) {
        console.error('❌ Erro ao gerar alertas de pagamento:', error);
        throw error;
    }
};

// =====================================================
// EXECUTAR TODOS OS ALERTAS
// =====================================================
exports.generateAllAlerts = async (req, res) => {
    try {
        const upcoming = await exports.generateUpcomingCheckinAlerts();
        const overdue = await exports.generateOverdueCheckinAlerts();
        const payments = await exports.generateOverduePaymentAlerts();

        res.json({
            success: true,
            alerts: {
                upcoming_checkin: upcoming,
                overdue_checkin: overdue,
                overdue_payment: payments
            }
        });
    } catch (error) {
        console.error('❌ Erro ao gerar alertas:', error);
        res.status(500).json({ error: 'Erro ao gerar alertas' });
    }
};

// =====================================================
// BUSCAR ALERTAS ATIVOS
// =====================================================
exports.getActiveAlerts = async (req, res) => {
    try {
        const [alerts] = await pool.query(
            `SELECT a.*, b.guest_name, b.check_in, r.room_number
             FROM alerts a
             JOIN bookings b ON a.booking_id = b.id
             JOIN rooms r ON b.room_id = r.id
             WHERE a.status = 'active'
             ORDER BY 
                FIELD(a.priority, 'urgente', 'alta', 'media', 'baixa'),
                a.created_at DESC
             LIMIT 50`
        );

        res.json(alerts);
    } catch (error) {
        console.error('❌ Erro ao buscar alertas:', error);
        res.status(500).json({ error: 'Erro ao buscar alertas' });
    }
};

// =====================================================
// RESOLVER ALERTA
// =====================================================
exports.resolveAlert = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(
            `UPDATE alerts 
             SET status = 'resolved', resolved_at = NOW()
             WHERE id = ?`,
            [id]
        );

        res.json({ success: true, message: 'Alerta resolvido' });
    } catch (error) {
        console.error('❌ Erro ao resolver alerta:', error);
        res.status(500).json({ error: 'Erro ao resolver alerta' });
    }
};