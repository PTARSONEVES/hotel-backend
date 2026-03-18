const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// =====================================================
// BUSCAR DADOS DO PRÓPRIO USUÁRIO (qualquer um logado)
// =====================================================
router.get('/me', async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, name, email, role, department, created_at 
             FROM users WHERE id = ?`,
            [req.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Buscar permissões do usuário
        const [permissions] = await pool.query(
            `SELECT p.name FROM permissions p
             JOIN role_permissions rp ON p.id = rp.permission_id
             WHERE rp.role = ?`,
            [users[0].role]
        );
        
        res.json({
            user: users[0],
            permissions: permissions.map(p => p.name)
        });
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

// =====================================================
// LISTAR USUÁRIOS (apenas admin)
// =====================================================
router.get('/', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, name, email, role, department, is_active, 
                    DATE(created_at) as created_at, last_login
             FROM users ORDER BY created_at DESC`
        );
        res.json(users);
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});

// =====================================================
// CRIAR USUÁRIO (admin)
// =====================================================
const bcrypt = require('bcryptjs');

router.post('/', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const { name, email, password, role, department } = req.body;
        
        // Verificar se email já existe
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, role, department)
             VALUES (?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, role || 'hospede', department]
        );
        
        res.status(201).json({
            id: result.insertId,
            message: 'Usuário criado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

// =====================================================
// ATUALIZAR USUÁRIO (admin ou próprio)
// =====================================================
router.put('/:id', authorize.isSelfOrAdmin('id'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, department, is_active } = req.body;
        
        await pool.query(
            `UPDATE users 
             SET name = ?, email = ?, role = ?, department = ?, is_active = ?
             WHERE id = ?`,
            [name, email, role, department, is_active, id]
        );
        
        res.json({ message: 'Usuário atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});

// =====================================================
// LISTAR PERMISSÕES DO USUÁRIO
// =====================================================
router.get('/permissions', async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT role FROM users WHERE id = ?',
            [req.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const [permissions] = await pool.query(
            `SELECT p.name FROM permissions p
             JOIN role_permissions rp ON p.id = rp.permission_id
             WHERE rp.role = ?`,
            [users[0].role]
        );
        
        res.json(permissions.map(p => p.name));
    } catch (error) {
        console.error('Erro ao buscar permissões:', error);
        res.status(500).json({ error: 'Erro ao buscar permissões' });
    }
});

// =====================================================
// LISTAR TODAS AS PERMISSÕES DISPONÍVEIS (admin)
// =====================================================
router.get('/permissions/all', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const [permissions] = await pool.query(
            'SELECT * FROM permissions ORDER BY module, name'
        );
        res.json(permissions);
    } catch (error) {
        console.error('Erro ao listar permissões:', error);
        res.status(500).json({ error: 'Erro ao listar permissões' });
    }
});

module.exports = router;