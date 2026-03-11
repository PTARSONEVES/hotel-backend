const pool = require('../config/database');

exports.getAccounts = async (req, res) => {
    try {
        const { type, status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM accounts WHERE user_id = ?';
        const params = [req.userId];

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY due_date DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [accounts] = await pool.query(query, params);

        // Buscar total de registros para paginação
        const [totalResult] = await pool.query(
            'SELECT COUNT(*) as total FROM accounts WHERE user_id = ?',
            [req.userId]
        );

        res.json({
            accounts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalResult[0].total / limit),
                totalItems: totalResult[0].total
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar contas' });
    }
};

exports.createAccount = async (req, res) => {
    try {
        const { title, description, amount, type, due_date } = req.body;

        const [result] = await pool.query(
            `INSERT INTO accounts 
            (user_id, title, description, amount, type, due_date) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [req.userId, title, description, amount, type, due_date]
        );

        const [newAccount] = await pool.query(
            'SELECT * FROM accounts WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newAccount[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar conta' });
    }
};

exports.updateAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, amount, status, payment_date } = req.body;

        // Verificar se a conta pertence ao usuário
        const [accounts] = await pool.query(
            'SELECT * FROM accounts WHERE id = ? AND user_id = ?',
            [id, req.userId]
        );

        if (accounts.length === 0) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }

        await pool.query(
            `UPDATE accounts 
            SET title = ?, description = ?, amount = ?, 
                status = ?, payment_date = ?
            WHERE id = ?`,
            [title, description, amount, status, payment_date, id]
        );

        const [updatedAccount] = await pool.query(
            'SELECT * FROM accounts WHERE id = ?',
            [id]
        );

        res.json(updatedAccount[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar conta' });
    }
};

exports.deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(
            'DELETE FROM accounts WHERE id = ? AND user_id = ?',
            [id, req.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }

        res.json({ message: 'Conta deletada com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao deletar conta' });
    }
};

exports.getDashboardData = async (req, res) => {
    try {
        // Totais de contas a pagar
        const [toPay] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN status = 'pendente' THEN amount ELSE 0 END), 0) as pending,
                COALESCE(SUM(CASE WHEN status = 'pago' THEN amount ELSE 0 END), 0) as paid,
                COALESCE(SUM(CASE WHEN status = 'vencido' THEN amount ELSE 0 END), 0) as overdue
            FROM accounts 
            WHERE user_id = ? AND type = 'pagar'`,
            [req.userId]
        );

        // Totais de contas a receber
        const [toReceive] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN status = 'pendente' THEN amount ELSE 0 END), 0) as pending,
                COALESCE(SUM(CASE WHEN status = 'pago' THEN amount ELSE 0 END), 0) as received,
                COALESCE(SUM(CASE WHEN status = 'vencido' THEN amount ELSE 0 END), 0) as overdue
            FROM accounts 
            WHERE user_id = ? AND type = 'receber'`,
            [req.userId]
        );

        // Últimas 5 contas
        const [recentAccounts] = await pool.query(
            `SELECT * FROM accounts 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 5`,
            [req.userId]
        );

        // Contas a vencer nos próximos 7 dias
        const [upcoming] = await pool.query(
            `SELECT * FROM accounts 
            WHERE user_id = ? 
                AND status = 'pendente'
                AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY due_date ASC`,
            [req.userId]
        );

        res.json({
            toPay: toPay[0],
            toReceive: toReceive[0],
            recentAccounts,
            upcoming
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard' });
    }
};