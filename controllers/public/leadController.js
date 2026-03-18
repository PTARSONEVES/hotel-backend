const pool = require('../../config/database');

// =====================================================
// CRIAR NOVO LEAD (PÚBLICO)
// =====================================================
exports.createLead = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            is_whatsapp,
            check_in,
            check_out,
            adults,
            children,
            flat_type,
            message
        } = req.body;

        // Validações básicas
        if (!name || !email || !phone) {
            return res.status(400).json({ error: 'Nome, email e telefone são obrigatórios' });
        }

        // Capturar IP e User Agent
        const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const user_agent = req.headers['user-agent'];

        // Inserir lead
        const [result] = await pool.query(
            `INSERT INTO leads 
             (name, email, phone, is_whatsapp, check_in, check_out, adults, children, flat_type, message, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                email,
                phone,
                is_whatsapp || false,
                check_in || null,
                check_out || null,
                adults || 1,
                children || 0,
                flat_type || null,
                message || null,
                ip_address,
                user_agent
            ]
        );

        // Aqui você pode adicionar integração com email marketing
        // await sendToEmailMarketing(email, name);

        res.status(201).json({
            success: true,
            message: 'Lead cadastrado com sucesso',
            lead_id: result.insertId
        });

    } catch (error) {
        console.error('❌ Erro ao criar lead:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

// =====================================================
// ENVIAR RESPOSTA AUTOMÁTICA (OPCIONAL)
// =====================================================
exports.sendAutoResponder = async (req, res) => {
    try {
        const { email, name } = req.body;

        // Aqui você implementaria o envio de email
        // Por enquanto, só retorna sucesso
        
        res.json({ 
            success: true, 
            message: 'Email automático enviado (simulado)' 
        });
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error);
        res.status(500).json({ error: 'Erro ao enviar email' });
    }
};

// =====================================================
// LISTAR LEADS (PROTEGIDO - SÓ PARA ADMIN)
// =====================================================
exports.getLeads = async (req, res) => {
    try {
        const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM leads WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (startDate) {
            query += ' AND created_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND created_at <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [leads] = await pool.query(query, params);

        // Total para paginação
        const [total] = await pool.query(
            'SELECT COUNT(*) as count FROM leads' + 
            (status ? ' WHERE status = ?' : ''),
            status ? [status] : []
        );

        res.json({
            leads,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total[0].count / limit),
                totalItems: total[0].count,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Erro ao listar leads:', error);
        res.status(500).json({ error: 'Erro ao listar leads' });
    }
};

// =====================================================
// ATUALIZAR STATUS DO LEAD (PROTEGIDO)
// =====================================================
exports.updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        await pool.query(
            'UPDATE leads SET status = ?, notes = ? WHERE id = ?',
            [status, notes, id]
        );

        res.json({ success: true, message: 'Lead atualizado com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao atualizar lead:', error);
        res.status(500).json({ error: 'Erro ao atualizar lead' });
    }
};

// =====================================================
// CONVERTER LEAD EM RESERVA (PROTEGIDO)
// =====================================================
exports.convertLeadToBooking = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { booking_id } = req.body;

        // Atualizar lead
        await connection.query(
            'UPDATE leads SET status = ?, converted_booking_id = ? WHERE id = ?',
            ['convertido', booking_id, id]
        );

        await connection.commit();

        res.json({ success: true, message: 'Lead convertido em reserva' });

    } catch (error) {
        await connection.rollback();
        console.error('❌ Erro ao converter lead:', error);
        res.status(500).json({ error: 'Erro ao converter lead' });
    } finally {
        connection.release();
    }
};