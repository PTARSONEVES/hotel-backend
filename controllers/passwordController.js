const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

// Configurar SendGrid com a API Key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid configurado com API Key');
} else {
    console.warn('⚠️ SENDGRID_API_KEY não configurada');
}

// =====================================================
// FUNÇÃO AUXILIAR PARA ENVIO DE EMAIL
// =====================================================
const sendEmail = async (to, subject, htmlContent) => {
    try {
        const msg = {
            to,
            from: process.env.SENDGRID_FROM_EMAIL || 'reservas.ancorarporto@gmail.com',
            subject,
            html: htmlContent
        };

        const response = await sgMail.send(msg);
        console.log(`✅ Email enviado para ${to}, ID:`, response[0]?.headers['x-message-id']);
        return { success: true, messageId: response[0]?.headers['x-message-id'] };
    } catch (error) {
        console.error('❌ Erro no SendGrid:', error.response?.body || error.message);
        
        // Log detalhado para diagnóstico
        if (error.response) {
            console.error('Detalhes do erro:', {
                statusCode: error.code,
                body: error.response.body
            });
        }
        
        return { 
            success: false, 
            error: error.response?.body?.errors?.[0]?.message || error.message 
        };
    }
};

// =====================================================
// ROTA DE TESTE DO SENDGRID
// =====================================================
exports.testSendGrid = async (req, res) => {
    try {
        console.log('📧 Testando SendGrid...');
        console.log('📧 FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL);
        console.log('📧 API_KEY configurada:', process.env.SENDGRID_API_KEY ? 'Sim' : 'Não');

        const result = await sendEmail(
            process.env.SENDGRID_FROM_EMAIL, // Envia para si mesmo
            'Teste SendGrid - Sistema Financeiro',
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                <h2 style="color: #2563eb; text-align: center;">Teste de Configuração</h2>
                <p style="font-size: 16px;">Olá! 👋</p>
                <p style="font-size: 16px;">Se você está vendo este email, a integração com SendGrid está <strong style="color: #10b981;">funcionando perfeitamente</strong>!</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Configuração:</strong></p>
                    <p style="margin: 5px 0;">✅ SendGrid API Key: Configurada</p>
                    <p style="margin: 5px 0;">✅ Remetente: ${process.env.SENDGRID_FROM_EMAIL}</p>
                    <p style="margin: 5px 0;">✅ Horário: ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <p style="color: #6b7280; font-size: 14px; text-align: center;">
                    Este é um email automático de teste do seu Sistema Financeiro.
                </p>
            </div>
            `
        );

        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Email de teste enviado com sucesso!',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: result.error 
            });
        }
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// =====================================================
// SOLICITAR RECUPERAÇÃO DE SENHA (FORGOT PASSWORD)
// =====================================================
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

        // Template do email
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                <h2 style="color: #2563eb; text-align: center;">Recuperação de Senha</h2>
                
                <p style="font-size: 16px;">Olá, <strong>${user.name}</strong>!</p>
                
                <p style="font-size: 16px;">Recebemos uma solicitação para redefinir sua senha no <strong>Sistema Financeiro</strong>.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" 
                       style="background-color: #2563eb; color: white; padding: 14px 28px; 
                              text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;
                              display: inline-block;">
                        🔐 Redefinir Minha Senha
                    </a>
                </div>
                
                <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
                    ⏰ Este link é válido por <strong>1 hora</strong>.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;">
                
                <p style="color: #9ca3af; font-size: 13px; text-align: center;">
                    Se você não solicitou esta recuperação, ignore este email.<br>
                    Sua senha permanecerá a mesma.
                </p>
                
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">
                    Sistema Financeiro - Gerenciamento de Contas<br>
                    © ${new Date().getFullYear()} - Todos os direitos reservados
                </p>
            </div>
        `;

        // Enviar email via SendGrid
        const result = await sendEmail(
            user.email,
            '🔐 Recuperação de Senha - Sistema Financeiro',
            htmlContent
        );

        if (result.success) {
            console.log('✅ Email de recuperação enviado para:', user.email);
            res.json({ 
                message: 'Se o email existir, você receberá instruções de recuperação' 
            });
        } else {
            console.error('❌ Falha no envio do email:', result.error);
            res.status(500).json({ 
                error: 'Erro ao enviar email de recuperação. Tente novamente mais tarde.' 
            });
        }

    } catch (error) {
        console.error('❌ Erro no forgot password:', error);
        res.status(500).json({ error: 'Erro ao processar solicitação' });
    }
};

// =====================================================
// VERIFICAR TOKEN
// =====================================================
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

// =====================================================
// REDEFINIR SENHA
// =====================================================
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

// =====================================================
// ALTERAR SENHA (USUÁRIO LOGADO)
// =====================================================
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