const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const bcrypt = require('bcryptjs');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// =====================================================
// BUSCAR DADOS DO PRÓPRIO USUÁRIO
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
router.post('/', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const { name, email, password, role, department } = req.body;
        
        console.log('📝 Criando usuário:', { name, email, role });
        
        // Validar campos obrigatórios
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
        }
        
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
            `INSERT INTO users (name, email, password, role, department, is_active)
             VALUES (?, ?, ?, ?, ?, TRUE)`,
            [name, email, hashedPassword, role || 'hospede', department || null]
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
        const { name, email, role, department, is_active, password } = req.body;
        
        let query = 'UPDATE users SET name = ?, email = ?, role = ?, department = ?, is_active = ?';
        const params = [name, email, role, department, is_active];
        
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        await pool.query(query, params);
        
        res.json({ message: 'Usuário atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});

// =====================================================
// EXCLUIR USUÁRIO (apenas admin)
// =====================================================
router.delete('/:id', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Não permitir excluir o próprio usuário
        if (parseInt(id) === req.userId) {
            return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
        }
        
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'Usuário excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ error: 'Erro ao excluir usuário' });
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

// =====================================================
// CRIAR USUÁRIO (INTERNO) - SEM SENHA, ENVIA EMAIL
// =====================================================
router.post('/invite', authorize.minimumRole('admin'), async (req, res) => {
    try {
        const { name, email, role, department } = req.body;
        
        // Validar campos obrigatórios
        if (!name || !email) {
            return res.status(400).json({ error: 'Nome e email são obrigatórios' });
        }
        
        // Verificar se email já existe
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        
        // Gerar token de convite (expira em 7 dias)
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        // Criar usuário com senha temporária (será redefinida no primeiro acesso)
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        const [result] = await pool.query(
            `INSERT INTO users (name, email, password, role, department, is_active, invite_token, invite_expires_at)
             VALUES (?, ?, ?, ?, ?, FALSE, ?, ?)`,
            [name, email, hashedPassword, role || 'colaborador', department || null, inviteToken, expiresAt]
        );
        
        // Enviar email de convite
        const inviteLink = `${process.env.FRONTEND_URL}/complete-registration?token=${inviteToken}`;
        
        await sendInviteEmail(email, name, inviteLink);
        
        res.status(201).json({
            id: result.insertId,
            message: 'Convite enviado com sucesso. O usuário receberá um email para completar o cadastro.'
        });
        
    } catch (error) {
        console.error('Erro ao criar convite:', error);
        res.status(500).json({ error: 'Erro ao criar convite' });
    }
});

// =====================================================
// COMPLETAR CADASTRO (PRIMEIRO ACESSO)
// =====================================================
router.post('/complete-registration', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        // Validar token
        const [users] = await pool.query(
            'SELECT id, email FROM users WHERE invite_token = ? AND invite_expires_at > NOW()',
            [token]
        );
        
        if (users.length === 0) {
            return res.status(400).json({ error: 'Link inválido ou expirado' });
        }
        
        const user = users[0];
        
        // Atualizar senha e ativar usuário
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await pool.query(
            `UPDATE users 
             SET password = ?, is_active = TRUE, invite_token = NULL, invite_expires_at = NULL
             WHERE id = ?`,
            [hashedPassword, user.id]
        );
        
        res.json({ message: 'Cadastro completado com sucesso! Agora você pode fazer login.' });
        
    } catch (error) {
        console.error('Erro ao completar cadastro:', error);
        res.status(500).json({ error: 'Erro ao completar cadastro' });
    }
});

module.exports = router;