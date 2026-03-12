const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configurar transporte de email (exemplo com Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

console.log(transporter);
// Solicitar recuperação de senha
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        console.log('📧 Solicitação de recuperação para:', email);

        // Verificar se usuário existe
        const [users] = await pool.query(
            'SELECT id, name, email FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            // Por segurança, não informamos que o email não existe
            return res.json({ 
                message: 'Se o email existir, você receberá instruções de recuperação' 
            });
        }

        const user = users[0];

        // Gerar token único
        const token = crypto.randomBytes(32).toString('hex');

        // Token expira em 1 hora
        const expiresAt = new Date(Date.now() + 3600000);

        // Invalidar tokens anteriores
        await pool.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = ? AND used = FALSE',
            [user.id]
        );

        // Salvar token no banco
        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, token, expiresAt]
        );

        // Criar link de recuperação
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
        console.log('📧 Link gerado:', resetLink);
        console.log('📧 Enviando email para:', user.email);

        // Enviar email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Recuperação de Senha - Sistema Financeiro',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Recuperação de Senha</h2>
                    <p>Olá, <strong>${user.name}</strong>!</p>
                    <p>Recebemos uma solicitação para redefinir sua senha.</p>
                    <p>Clique no botão abaixo para criar uma nova senha:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" 
                           style="background-color: #2563eb; color: white; padding: 12px 24px; 
                                  text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Redefinir Senha
                        </a>
                    </div>
                    <p>Se você não solicitou esta recuperação, ignore este email.</p>
                    <p>Este link expira em <strong>1 hora</strong>.</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        Sistema Financeiro - Gerenciamento de Contas
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
console.log('✅ Email enviado com sucesso');

res.json({ 
            message: 'Se o email existir, você receberá instruções de recuperação' 
        });

    } catch (error) {
        console.error('❌ Erro detalhado:', error);
        res.status(500).json({ error: error.message });
    }
};

// Verificar token
exports.verifyToken = async (req, res) => {
    try {
        const { token } = req.params;

        const [tokens] = await pool.query(
            `SELECT prt.*, u.email, u.name 
             FROM password_reset_tokens prt
             JOIN users u ON prt.user_id = u.id
             WHERE prt.token = ? AND prt.used = FALSE AND prt.expires_at > NOW()`,
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ error: 'Token inválido ou expirado' });
        }

        res.json({ valid: true });

    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(500).json({ error: 'Erro ao verificar token' });
    }
};

// Redefinir senha
exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        // Validar senha
        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
        }

        // Buscar token válido
        const [tokens] = await pool.query(
            `SELECT prt.*, u.id as user_id 
             FROM password_reset_tokens prt
             JOIN users u ON prt.user_id = u.id
             WHERE prt.token = ? AND prt.used = FALSE AND prt.expires_at > NOW()`,
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ error: 'Token inválido ou expirado' });
        }

        const resetToken = tokens[0];

        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atualizar senha do usuário
        await pool.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, resetToken.user_id]
        );

        // Marcar token como usado
        await pool.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE id = ?',
            [resetToken.id]
        );

        // Invalidar outros tokens do usuário
        await pool.query(
            'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = ? AND used = FALSE',
            [resetToken.user_id]
        );

        res.json({ message: 'Senha redefinida com sucesso' });

    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
};

// Alterar senha (usuário logado)
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.userId;

        // Validar nova senha
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
        }

        // Buscar usuário
        const [users] = await pool.query(
            'SELECT password FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Verificar senha atual
        const validPassword = await bcrypt.compare(currentPassword, users[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }

        // Hash da nova senha
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Atualizar senha
        await pool.query(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({ message: 'Senha alterada com sucesso' });

    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
};

// Adicione este teste temporário no final do passwordController.js

// Teste rápido de email (remova depois)
exports.testEmail = async (req, res) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: 'seu-email@gmail.com', // Seu email para teste
            subject: 'Teste',
            text: 'Funcionou!'
        });
        res.json({ message: 'Email enviado' });
    } catch (error) {
        console.error('Erro no teste:', error);
        res.status(500).json({ error: error.message });
    }
};