const pool = require('../config/database');
const { registerOperation } = require('../utils/codeGenerator');

// =====================================================
// DASHBOARD FINANCEIRO - VERSÃO COMPLETA
// =====================================================
exports.getDashboard = async (req, res) => {
    try {
        const { startDate, endDate, code } = req.query;
        
        console.log('📊 Carregando dashboard financeiro:', { startDate, endDate });

        // Se não informar datas, usar mês atual
        const hoje = new Date();
        const inicio = startDate || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        const fim = endDate || hoje.toISOString().split('T')[0];

        // =====================================================
        // 1. RESUMO DE CONTAS A RECEBER
        // =====================================================
        const [receivableSummary] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN due_date BETWEEN ? AND ? AND status = 'pago' THEN amount ELSE 0 END), 0) as recebido,
                COALESCE(SUM(CASE WHEN due_date BETWEEN ? AND ? AND status = 'pendente' THEN amount ELSE 0 END), 0) as a_receber
             FROM accounts 
             WHERE type = 'receber'`,
            [inicio, fim, inicio, fim]
        );

        // =====================================================
        // 2. RESUMO DE CONTAS A PAGAR
        // =====================================================
        let payableSummary = { pago: 0, a_pagar: 0 };
        try {
            const [result] = await pool.query(
                `SELECT 
                    COALESCE(SUM(CASE WHEN due_date BETWEEN ? AND ? AND status = 'pago' THEN amount ELSE 0 END), 0) as pago,
                    COALESCE(SUM(CASE WHEN due_date BETWEEN ? AND ? AND status = 'pendente' THEN amount ELSE 0 END), 0) as a_pagar
                 FROM bills`,
                [inicio, fim, inicio, fim]
            );
            payableSummary = result[0];
        } catch (error) {
            console.log('ℹ️ Tabela bills não existe ainda');
        }

        // =====================================================
        // 3. CONTAS A RECEBER DETALHADAS
        // =====================================================
        const [receivables] = await pool.query(
            `SELECT a.*, 
                    COALESCE(g.name, 'N/A') as guest_name,
                    COALESCE(r.room_number, 'N/A') as room_number
             FROM accounts a
             LEFT JOIN bookings b ON a.reference_id = b.id
             LEFT JOIN guests g ON b.guest_id = g.id
             LEFT JOIN rooms r ON b.room_id = r.id
             WHERE a.type = 'receber'
               AND (a.due_date BETWEEN ? AND ? OR a.payment_date BETWEEN ? AND ?)
             ORDER BY a.due_date ASC`,
            [inicio, fim, inicio, fim]
        );

        // =====================================================
        // 4. CONTAS A PAGAR DETALHADAS
        // =====================================================
        let payables = [];
        try {
            const [bills] = await pool.query(
                `SELECT b.*, ac.name as category_name
                 FROM bills b
                 LEFT JOIN account_categories ac ON b.category_id = ac.id
                 WHERE (b.due_date BETWEEN ? AND ? OR b.payment_date BETWEEN ? AND ?)
                 ORDER BY b.due_date ASC`,
                [inicio, fim, inicio, fim]
            );
            payables = bills;
        } catch (error) {
            console.log('ℹ️ Tabela bills não existe ainda');
        }

        // =====================================================
        // 5. RESUMO CONSOLIDADO
        // =====================================================
        const summary = {
            recebido: parseFloat(receivableSummary[0]?.recebido || 0),
            a_receber: parseFloat(receivableSummary[0]?.a_receber || 0),
            pago: parseFloat(payableSummary?.pago || 0),
            a_pagar: parseFloat(payableSummary?.a_pagar || 0)
        };

        // =====================================================
        // 6. CÁLCULOS DOS INDICADORES
        // =====================================================
        const totalReceitas = summary.recebido + summary.a_receber;
        const totalDespesas = summary.pago + summary.a_pagar;
        const saldoPeriodo = summary.recebido - summary.pago;
        const saldoPrevisto = (summary.a_receber - summary.a_pagar) + saldoPeriodo;

        // =====================================================
        // 7. RECEITAS POR CATEGORIA
        // =====================================================
        let revenueByCategory = [];
        try {
            const [revenue] = await pool.query(
                `SELECT COALESCE(ac.name, 'Sem categoria') as name, 
                        COALESCE(SUM(a.amount), 0) as total
                 FROM accounts a
                 LEFT JOIN account_categories ac ON a.category_id = ac.id
                 WHERE a.type = 'receber' AND a.status = 'pago'
                 AND a.payment_date BETWEEN ? AND ?
                 GROUP BY ac.name`,
                [inicio, fim]
            );
            revenueByCategory = revenue;
        } catch (error) {
            console.log('ℹ️ Erro ao buscar receitas por categoria');
        }

        // =====================================================
        // 8. DESPESAS POR CATEGORIA
        // =====================================================
        let expensesByCategory = [];
        try {
            const [expenses] = await pool.query(
                `SELECT COALESCE(ac.name, 'Sem categoria') as name, 
                        COALESCE(SUM(b.amount), 0) as total
                 FROM bills b
                 LEFT JOIN account_categories ac ON b.category_id = ac.id
                 WHERE b.status = 'pago' AND b.payment_date BETWEEN ? AND ?
                 GROUP BY ac.name`,
                [inicio, fim]
            );
            expensesByCategory = expenses;
        } catch (error) {
            console.log('ℹ️ Erro ao buscar despesas por categoria');
        }

        // =====================================================
        // 9. RESPOSTA FINAL
        // =====================================================
        console.log('📊 Dashboard carregado:', {
            recebido: summary.recebido,
            a_receber: summary.a_receber,
            pago: summary.pago,
            a_pagar: summary.a_pagar,
            receivables: receivables.length,
            payables: payables.length
        });

        res.json({
            summary,
            totalReceitas,
            totalDespesas,
            saldoPeriodo,
            saldoPrevisto,
            receivables,
            payables,
            revenueByCategory,
            expensesByCategory
        });

    } catch (error) {
        console.error('❌ Erro detalhado no dashboard financeiro:', error);
        res.status(500).json({ 
            error: 'Erro ao carregar dashboard',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// =====================================================
// CRIAR CONTA A RECEBER (COM CÓDIGO DE OPERAÇÃO)
// =====================================================
exports.createReceivable = async (req, res) => {
    try {
        const { title, description, amount, due_date, category_id, notes } = req.body;

        console.log('📝 Criando conta a receber:', { title, amount, due_date, category_id });

        // Validações
        if (!title || !amount || !due_date) {
            return res.status(400).json({ error: 'Título, valor e data de vencimento são obrigatórios' });
        }

        const [result] = await pool.query(
            `INSERT INTO accounts 
             (user_id, title, description, amount, type, due_date, category_id, notes, created_by, status)
             VALUES (?, ?, ?, ?, 'receber', ?, ?, ?, ?, 'pendente')`,
            [req.userId, title, description || null, amount, due_date, category_id || null, notes || null, req.userId]
        );

        const accountId = result.insertId;

        // Gerar código de operação
        const operationCode = await registerOperation('accounts', accountId, pool);

        // Atualizar o registro com o código
        await pool.query(
            'UPDATE accounts SET operation_code = ? WHERE id = ?',
            [operationCode, accountId]
        );

        console.log(`✅ Conta a receber criada com código: ${operationCode}`);

        res.status(201).json({
            id: accountId,
            operationCode,
            message: 'Conta a receber criada com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao criar conta a receber:', error);
        res.status(500).json({ 
            error: 'Erro ao criar conta a receber',
            details: error.message
        });
    }
};

// =====================================================
// LISTAR CONTAS A RECEBER (COM FILTRO POR CÓDIGO)
// =====================================================
exports.getReceivables = async (req, res) => {
    try {
        const { status, startDate, endDate, code } = req.query;
        
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
        if (code) {
            query += ' AND a.operation_code = ?';
            params.push(code);
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
// BUSCAR CONTA A RECEBER POR CÓDIGO
// =====================================================
exports.getReceivableByCode = async (req, res) => {
    try {
        const { code } = req.params;
        
        const [receivables] = await pool.query(
            `SELECT a.*, b.guest_name, b.room_number
             FROM accounts a
             LEFT JOIN bookings b ON a.reference_id = b.id
             WHERE a.type = 'receber' AND a.operation_code = ?`,
            [code]
        );
        
        if (receivables.length === 0) {
            return res.status(404).json({ error: 'Conta a receber não encontrada' });
        }
        
        res.json(receivables[0]);
        
    } catch (error) {
        console.error('Erro ao buscar conta por código:', error);
        res.status(500).json({ error: 'Erro ao buscar conta' });
    }
};

// =====================================================
// CONTAS A PAGAR
// =====================================================
exports.getBills = async (req, res) => {
    let payables = [];
    try {
        const { status, category_id } = req.query;

        let billsQuery = `
            SELECT b.*, ac.name as category_name
            FROM bills b
            LEFT JOIN account_categories ac ON b.category_id = ac.id
            WHERE (b.due_date BETWEEN ? AND ? OR b.payment_date BETWEEN ? AND ?)
        `;
        const billsParams = [inicio, fim, inicio, fim];

        if (code) {
            billsQuery += ' AND b.operation_code = ?';
            billsParams.push(code);
        }

        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        if (category_id) {
            query += ' AND b.category_id = ?';
            params.push(category_id);
        }

        billsQuery += ' ORDER BY b.due_date ASC';

        const [bills] = await pool.query(billsQuery, billsParams);
        res.json(bills);

    } catch (error) {
        console.error('Erro ao buscar contas a pagar:', error);
        res.status(500).json({ error: 'Erro ao buscar contas a pagar' });
    }
};

// =====================================================
// CRIAR CONTA A PAGAR (COM CÓDIGO DE OPERAÇÃO)
// =====================================================
exports.createBill = async (req, res) => {
    try {
        const { description, amount, due_date, category_id, supplier, notes } = req.body;

        console.log('📝 Criando conta a pagar:', { description, amount, due_date });

        const [result] = await pool.query(
            `INSERT INTO bills 
             (user_id, description, amount, due_date, category_id, supplier, notes, created_by, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
            [req.userId, description, amount, due_date, category_id || null, supplier || null, notes || null, req.userId]
        );

        const billId = result.insertId;

        // Gerar código de operação
        const operationCode = await registerOperation('bills', billId, pool);

        // Atualizar o registro com o código
        await pool.query(
            'UPDATE bills SET operation_code = ? WHERE id = ?',
            [operationCode, billId]
        );

        console.log(`✅ Conta a pagar criada com código: ${operationCode}`);

        res.status(201).json({
            id: billId,
            operationCode,
            message: 'Conta a pagar criada com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao criar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao criar conta a pagar' });
    }
};

// =====================================================
// PAGAR CONTA
// =====================================================
exports.payBill = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_date } = req.body;

        await pool.query(
            `UPDATE bills 
             SET status = 'pago', payment_date = ?
             WHERE id = ?`,
            [payment_date || new Date(), id]
        );

        res.json({ message: 'Pagamento registrado com sucesso' });

    } catch (error) {
        console.error('Erro ao registrar pagamento:', error);
        res.status(500).json({ error: 'Erro ao registrar pagamento' });
    }
};

// =====================================================
// RELATÓRIOS
// =====================================================
exports.getReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const [cashFlow] = await pool.query(
            `SELECT 
                DATE(date) as period,
                SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END) as revenue,
                SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END) as expenses,
                SUM(CASE WHEN type = 'receita' THEN amount ELSE -amount END) as balance
             FROM financial_transactions
             WHERE date BETWEEN ? AND ?
             GROUP BY DATE(date)
             ORDER BY period`,
            [startDate, endDate]
        );

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
// =====================================================
// ATUALIZAR CONTA A PAGAR
// =====================================================
exports.updateBill = async (req, res) => {
    try {
        const { id } = req.params;
        const { description, amount, due_date, category_id, supplier, notes } = req.body;

        await pool.query(
            `UPDATE bills 
             SET description = ?, amount = ?, due_date = ?, 
                 category_id = ?, supplier = ?, notes = ?
             WHERE id = ?`,
            [description, amount, due_date, category_id, supplier, notes, id]
        );

        res.json({ message: 'Conta a pagar atualizada com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao atualizar conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao atualizar conta a pagar' });
    }
};

// =====================================================
// ATUALIZAR CONTA A RECEBER
// =====================================================
exports.updateReceivable = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, amount, due_date, status, notes } = req.body;

        await pool.query(
            `UPDATE accounts 
             SET title = ?, amount = ?, due_date = ?, status = ?, notes = ?
             WHERE id = ? AND type = 'receber'`,
            [title, amount, due_date, status, notes, id]
        );

        res.json({ message: 'Conta a receber atualizada com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao atualizar conta a receber:', error);
        res.status(500).json({ error: 'Erro ao atualizar conta a receber' });
    }
};

// =====================================================
// EXCLUIR CONTA A PAGAR
// =====================================================
exports.deleteBill = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query('DELETE FROM bills WHERE id = ?', [id]);
        res.json({ message: 'Conta a pagar excluída com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao excluir conta a pagar:', error);
        res.status(500).json({ error: 'Erro ao excluir conta a pagar' });
    }
};

// =====================================================
// EXCLUIR CONTA A RECEBER
// =====================================================
exports.deleteReceivable = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query('DELETE FROM accounts WHERE id = ? AND type = \'receber\'', [id]);
        res.json({ message: 'Conta a receber excluída com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao excluir conta a receber:', error);
        res.status(500).json({ error: 'Erro ao excluir conta a receber' });
    }
};

// =====================================================
// BUSCAR CATEGORIAS DE RECEITAS
// =====================================================
exports.getRevenueCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM account_categories WHERE type = "receita" ORDER BY name'
        );
        res.json(categories);
    } catch (error) {
        console.error('Erro ao buscar categorias de receita:', error);
        res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
};

// =====================================================
// RECEBER CONTA A RECEBER (MARCAR COMO PAGO)
// =====================================================
exports.receiveReceivable = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_date } = req.body;
        
        await pool.query(
            `UPDATE accounts 
             SET status = 'pago', payment_date = ?
             WHERE id = ? AND type = 'receber'`,
            [payment_date || new Date(), id]
        );
        
        res.json({ message: 'Recebimento registrado com sucesso' });
        
    } catch (error) {
        console.error('Erro ao registrar recebimento:', error);
        res.status(500).json({ error: 'Erro ao registrar recebimento' });
    }
};