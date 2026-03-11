const pool = require('../../../config/database');

// =====================================================
// PRODUTOS E CATEGORIAS
// =====================================================

// Listar categorias
exports.getCategories = async (req, res) => {
    try {
        const [categories] = await pool.query(`
            SELECT c.*, COUNT(p.id) as total_products
            FROM product_categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id
            ORDER BY c.name
        `);
        res.json(categories);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
};

// Listar produtos
exports.getProducts = async (req, res) => {
    try {
        const { category_id, active } = req.query;
        
        let query = `
            SELECT p.*, c.name as category_name,
                   (SELECT SUM(quantity) FROM stock_movements WHERE product_id = p.id AND type = 'entrada') as total_entradas,
                   (SELECT SUM(quantity) FROM stock_movements WHERE product_id = p.id AND type = 'consumo') as total_consumo
            FROM products p
            JOIN product_categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (category_id) {
            query += ' AND p.category_id = ?';
            params.push(category_id);
        }
        
        if (active !== undefined) {
            query += ' AND p.active = ?';
            params.push(active === 'true');
        }
        
        query += ' ORDER BY c.name, p.name';
        
        const [products] = await pool.query(query, params);
        res.json(products);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
};

// Criar produto
exports.createProduct = async (req, res) => {
    try {
        const { category_id, name, description, unit_price, cost_price, stock_quantity, min_stock, unit } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO products 
             (category_id, name, description, unit_price, cost_price, stock_quantity, min_stock, unit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [category_id, name, description, unit_price, cost_price, stock_quantity || 0, min_stock || 5, unit || 'un']
        );
        
        res.status(201).json({
            id: result.insertId,
            message: 'Produto criado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
};

// Atualizar produto
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_id, name, description, unit_price, cost_price, min_stock, unit, active } = req.body;
        
        await pool.query(
            `UPDATE products 
             SET category_id = ?, name = ?, description = ?, unit_price = ?, 
                 cost_price = ?, min_stock = ?, unit = ?, active = ?
             WHERE id = ?`,
            [category_id, name, description, unit_price, cost_price, min_stock, unit, active, id]
        );
        
        res.json({ message: 'Produto atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
};

// =====================================================
// MOVIMENTAÇÕES DE ESTOQUE
// =====================================================

// Registrar consumo
exports.addConsumption = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { booking_id, product_id, quantity, unit_price } = req.body;
        
        // Buscar produto
        const [products] = await connection.query(
            'SELECT * FROM products WHERE id = ?',
            [product_id]
        );
        
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        
        const product = products[0];
        const total_price = quantity * (unit_price || product.unit_price);
        
        // Registrar consumo
        const [result] = await connection.query(
            `INSERT INTO consumptions 
             (booking_id, description, quantity, unit_price, total_price, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [booking_id, product.name, quantity, unit_price || product.unit_price, total_price, req.userId]
        );
        
        // Registrar movimentação de estoque
        await connection.query(
            `INSERT INTO stock_movements 
             (product_id, type, quantity, unit_price, reason, booking_id, created_by)
             VALUES (?, 'consumo', ?, ?, ?, ?, ?)`,
            [product_id, -quantity, unit_price || product.unit_price, 'Consumo hóspede', booking_id, req.userId]
        );
        
        // Atualizar estoque
        await connection.query(
            'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
            [quantity, product_id]
        );
        
        await connection.commit();
        
        res.status(201).json({
            id: result.insertId,
            message: 'Consumo registrado com sucesso'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar consumo:', error);
        res.status(500).json({ error: 'Erro ao registrar consumo' });
    } finally {
        connection.release();
    }
};

// Registrar entrada de estoque
exports.addStockEntry = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { product_id, quantity, unit_price, reason } = req.body;
        
        // Registrar movimentação
        await connection.query(
            `INSERT INTO stock_movements 
             (product_id, type, quantity, unit_price, reason, created_by)
             VALUES (?, 'entrada', ?, ?, ?, ?)`,
            [product_id, quantity, unit_price, reason || 'Entrada de estoque', req.userId]
        );
        
        // Atualizar estoque
        await connection.query(
            'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
            [quantity, product_id]
        );
        
        await connection.commit();
        
        res.json({ message: 'Entrada registrada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao registrar entrada:', error);
        res.status(500).json({ error: 'Erro ao registrar entrada' });
    } finally {
        connection.release();
    }
};

// Listar movimentações de um produto
exports.getProductMovements = async (req, res) => {
    try {
        const { product_id } = req.params;
        
        const [movements] = await pool.query(`
            SELECT m.*, 
                   u.name as user_name,
                   b.guest_name
            FROM stock_movements m
            LEFT JOIN users u ON m.created_by = u.id
            LEFT JOIN bookings b ON m.booking_id = b.id
            WHERE m.product_id = ?
            ORDER BY m.created_at DESC
            LIMIT 100
        `, [product_id]);
        
        res.json(movements);
    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
        res.status(500).json({ error: 'Erro ao buscar movimentações' });
    }
};

// =====================================================
// FATURAMENTO DA RESERVA
// =====================================================

// Fechar conta da reserva
exports.closeBookingBill = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const { booking_id } = req.params;
        const { payment_method } = req.body;
        
        // Buscar reserva e consumos
        const [booking] = await connection.query(
            'SELECT * FROM bookings WHERE id = ?',
            [booking_id]
        );
        
        const [consumptions] = await connection.query(
            'SELECT SUM(total_price) as total FROM consumptions WHERE booking_id = ?',
            [booking_id]
        );
        
        const consumptionTotal = consumptions[0].total || 0;
        const totalAmount = parseFloat(booking[0].total_amount) + consumptionTotal;
        
        // Atualizar reserva com consumos
        await connection.query(
            `UPDATE bookings 
             SET total_amount = ?,
                 payment_status = 'pago',
                 payment_method = ?
             WHERE id = ?`,
            [totalAmount, payment_method, booking_id]
        );
        
        // CRIAR CONTA A RECEBER NO SISTEMA FINANCEIRO
        await connection.query(
            `INSERT INTO accounts 
             (user_id, title, description, amount, type, due_date, status, payment_date)
             VALUES (?, ?, ?, ?, 'receber', ?, 'pago', NOW())`,
            [
                req.userId,
                `Reserva #${booking_id} - ${booking[0].guest_name}`,
                `Hospedagem + Consumos`,
                totalAmount,
                new Date().toISOString().split('T')[0]
            ]
        );
        
        await connection.commit();
        
        res.json({ 
            message: 'Conta fechada com sucesso',
            total: totalAmount
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao fechar conta:', error);
        res.status(500).json({ error: 'Erro ao fechar conta' });
    } finally {
        connection.release();
    }
};