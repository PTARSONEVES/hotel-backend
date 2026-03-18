//console.log('✅ financialController carregado!');
const pool = require('../config/database');

// =====================================================
// DASHBOARD FINANCEIRO
// =====================================================
exports.getDashboard = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        console.log('📊 Carregando dashboard financeiro:', { startDate, endDate });

        // Se não informar datas, usar mês atual
        const hoje = new Date();
        const inicio = startDate || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = endDate || hoje.toISOString().split('T')[0];

        // Resumo do período
        const [summary] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'receber' AND status = 'pago' THEN amount ELSE 0 END), 0) as recebido,
                COALESCE(SUM(CASE WHEN type = 'receber' AND status = 'pendente' THEN amount ELSE 0 END), 0) as a_receber,
                0 as pago,
                0 as a_pagar
             FROM accounts 
             WHERE (payment_date BETWEEN ? AND ?) OR (due_date BETWEEN ? AND ?)`,
            [inicio, fim, inicio, fim]
        );

        // Buscar contas a receber detalhadas - CORRIGIDO
        const [receivables] = await pool.query(
            `SELECT a.*, 
                    COALESCE(g.name, 'N/A') as guest_name,
                    COALESCE(r.room_number, 'N/A') as room_number
             FROM accounts a
             LEFT JOIN bookings b ON a.reference_id = b.id
             LEFT JOIN guests g ON b.guest_id = g.id
             LEFT JOIN rooms r ON b.room_id = r.id
             WHERE a.type = 'receber' 
             AND a.due_date BETWEEN ? AND ?
             ORDER BY a.due_date ASC
             LIMIT 10`,
            [inicio, fim]
        );

        // Buscar contas a pagar (se tabela existir)
        let payables = [];
        try {
            const [bills] = await pool.query(
                `SELECT * FROM bills 
                 WHERE due_date BETWEEN ? AND ?
                 ORDER BY due_date ASC
                 LIMIT 10`,
                [inicio, fim]
            );
            payables = bills;
        } catch (error) {
            console.log('ℹ️ Tabela bills não existe ainda');
        }

        res.json({
            summary: {
                recebido: summary[0]?.recebido || 0,
                a_receber: summary[0]?.a_receber || 0,
                pago: 0,
                a_pagar: 0
            },
            receivables,
            payables,
            revenueByCategory: [],
            expensesByCategory: []
        });

    } catch (error) {
        console.error('❌ Erro detalhado no dashboard financeiro:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar dashboard',
            details: error.message
        });
    }
};

// =====================================================
// CONTAS A RECEBER (de reservas)
// =====================================================
exports.getReceivables = async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;

        let query = `
            SELECT a.*, b.guest_name, b.room_number, b.check_in, b.check_out
            FROM accounts a
            LEFT JOIN bookings b ON a.reference_id = b.id
            WHERE a.type = 'receber'
        `;
        const params = [];

        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }
        if (startDate) {
            query += ' AND a.due_date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND a.due_date <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY a.due_date ASC';

        const [receivables] = await pool.query(query, params);
        res.json(receivables);

    } catch (error) {
        console.error('Erro ao buscar contas a receber:', error);
        res.status(500).json({ error: 'Erro ao buscar contas a receber' });
    }
};

// =====================================================
// CONTAS A PAGAR
// =====================================================
exports.getBills = async (req, res) => {
    try {
        const { status, category_id } = req.query;

        let query = `
            SELECT b.*, ac.name as category_name
            FROM bills b
            LEFT JOIN account_categories ac ON b.category_id = ac.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        if (category_id) {
            query += ' AND b.category_id = ?';
            params.push(category_id);
        }

        query += ' ORDER BY b.due_date ASC';

        const [bills] = await pool.query(query, params);
        res.json(bills);

    } catch (error) {
        console.error('Erro ao buscar contas a pagar:', error);
        res.status(500).json({ error: 'Erro ao buscar contas a pagar' });
    }
};

// =====================================================
// CRIAR CONTA A PAGAR
// =====================================================
exports.createBill = async (req, res) => {
    try {
        const { description, amount, due_date, category_id, supplier, notes } = req.body;

        const [result] = await pool.query(
            `INSERT INTO bills 
             (description, amount, due_date, category_id, supplier, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [description, amount, due_date, category_id, supplier, notes, req.userId]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Conta a pagar criada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao criar conta a pagar' });
    }
};

// =====================================================
// registrar pagamento de conta
// =====================================================
exports.payBill = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_date, notes } = req.body;

        await pool.query(
            `UPDATE bills 
             SET status = 'pago', payment_date = ?, notes = CONCAT(notes, '\n', ?)
             WHERE id = ?`,
            [payment_date || new Date(), notes, id]
        );

        res.json({ message: 'Pagamento registrado com sucesso' });

    } catch (error) {
        console.error('Erro ao registrar pagamento:', error);
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
    }
};

// =====================================================
// RELATÓRIOS FINANCEIROS
// =====================================================
exports.getReport = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'month' } = req.query;

        // Fluxo de caixa por período
        const [cashFlow] = await pool.query(
            `SELECT 
                DATE_FORMAT(date, ?) as period,
                SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as revenue,
                SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as expenses,
                SUM(CASE WHEN type = 'receita' THEN amount ELSE -amount END) as balance
             FROM financial_transactions
             WHERE date BETWEEN ? AND ?
             GROUP BY period
             ORDER BY period`,
            [groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m', startDate, endDate]
        );

        // Totais do período
        const [totals] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END), 0) as total_expenses
             FROM financial_transactions
             WHERE date BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        res.json({
            cashFlow,
            totals: totals[0],
            period: { startDate, endDate }
        });

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
};

// =====================================================
// CATEGORIAS
// =====================================================
exports.getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM account_categories ORDER BY type, name'
        );
        res.json(categories);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
};
