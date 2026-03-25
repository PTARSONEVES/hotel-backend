
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

// Declarar pool no escopo global
let pool;

// Importar pool com try/catch
console.log('🔍 Tentando importar pool...');
try {
    pool = require('../config/database');
    console.log('✅ Pool importado com sucesso!');
} catch (error) {
    console.error('❌ Erro ao importar pool:', error.message);
    pool = null;
}

// Configurar SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('✅ SendGrid configurado para emails de confirmação');
}

// =====================================================
// FUNÇÃO AUXILIAR: ENVIAR EMAIL DE CONFIRMAÇÃO
// =====================================================
async function sendConfirmationEmail(email, name, confirmationLink) {
    const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER,
        subject: 'Confirme seu cadastro - Ancorar Flat Resort',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Bem-vindo ao Ancorar Flat Resort!</h2>
                <p>Olá, <strong>${name}</strong>!</p>
                <p>Para confirmar seu cadastro e começar a usar o sistema, clique no botão abaixo:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${confirmationLink}" 
                       style="background-color: #2563eb; color: white; padding: 12px 24px; 
                              text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Confirmar Cadastro
                    </a>
                </div>
                <p>Se você não solicitou este cadastro, ignore este email.</p>
                <p>Este link expira em <strong>24 horas</strong>.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">
                    Ancorar Flat Resort - Porto de Galinhas
                </p>
            </div>
        `
    };
    
    try {
        await sgMail.send(msg);
        console.log(`✅ Email de confirmação enviado para ${email}`);
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error.response?.body || error);
    }
}

// =====================================================
// REGISTRO - APENAS NA TABELA USERS
// =====================================================
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validações
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
        }

        // Verificar se email já existe
        const [existing] = await pool.query(
            'SELECT id, email_verified FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            if (existing[0].email_verified) {
                return res.status(400).json({ error: 'Email já cadastrado' });
            } else {
                // Reenviar confirmação
                const newToken = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 1);

                await pool.query(
                    `UPDATE users 
                     SET verification_token = ?, verification_expires_at = ?
                     WHERE id = ?`,
                    [newToken, expiresAt, existing[0].id]
                );

                const confirmationLink = `${process.env.FRONTEND_URL}/confirm-email?token=${newToken}`;
                await sendConfirmationEmail(email, name, confirmationLink);

                return res.json({ 
                    message: 'Email já cadastrado mas não verificado. Enviamos um novo link de confirmação.' 
                });
            }
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Gerar token de verificação
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 1);

        console.log('📝 TOKEN GERADO:', verificationToken);

        // ✅ APENAS INSERIR NA TABELA USERS
        const [result] = await pool.query(
            `INSERT INTO users 
             (name, email, password, email_verified, verification_token, verification_expires_at, role)
             VALUES (?, ?, ?, FALSE, ?, ?, 'hospede')`,
            [name, email, hashedPassword, verificationToken, expiresAt]
        );

        console.log(`✅ Usuário criado para ${name} (aguardando confirmação)`);

        // Enviar email de confirmação
        const confirmationLink = `${process.env.FRONTEND_URL}/confirm-email?token=${verificationToken}`;
        console.log('🔗 LINK DE CONFIRMAÇÃO:', confirmationLink);

        await sendConfirmationEmail(email, name, confirmationLink);

        res.status(201).json({ 
            message: 'Cadastro realizado com sucesso! Verifique seu email para confirmar o cadastro.' 
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// =====================================================
// LOGIN - APENAS EMAILS VERIFICADOS
// =====================================================
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const user = users[0];

        // 🔒 VERIFICAÇÃO CRÍTICA: Email não verificado
        if (!user.email_verified) {
            return res.status(401).json({ 
                error: 'Email não confirmado. Verifique sua caixa de entrada para ativar sua conta.',
                needsVerification: true,
                email: user.email
            });
        }

        // Verificar se usuário está ativo
        if (!user.is_active) {
            return res.status(401).json({ error: 'Conta desativada. Entre em contato com o administrador.' });
        }

        // Verificar senha
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Atualizar último login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
};

// =====================================================
// CONFIRMAR EMAIL - CRIA HÓSPEDE APENAS SE CONFIRMADO
// =====================================================
exports.confirmEmail = async (req, res) => {
    try {
        const { token } = req.params;

        console.log('🔍 Verificando token:', token);

        const [users] = await pool.query(
            `SELECT id, email, name, verification_token, verification_expires_at, email_verified 
             FROM users 
             WHERE verification_token = ?`,
            [token]
        );

        if (users.length === 0) {
            console.log('❌ Token não encontrado');
            return res.status(400).json({ error: 'Link inválido' });
        }

        const user = users[0];

        console.log('📌 Dados:', {
            email: user.email,
            token_banco: user.verification_token,
            expires_at: user.verification_expires_at,
            now: new Date(),
            is_verified: user.email_verified
        });

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email já verificado' });
        }

        if (new Date() > new Date(user.verification_expires_at)) {
            return res.status(400).json({ error: 'Link expirado. Solicite um novo link.' });
        }

        // 1. Atualizar usuário como verificado
        await pool.query(
            `UPDATE users 
             SET email_verified = TRUE, 
                 verification_token = NULL, 
                 verification_expires_at = NULL,
                 verified_at = NOW(),
                 is_active = TRUE
             WHERE id = ?`,
            [user.id]
        );

        // 2. ✅ AGORA SIM, CRIAR/ATUALIZAR HÓSPEDE NA TABELA GUESTS
        const [existingGuest] = await pool.query(
            `SELECT id FROM guests WHERE email = ?`,
            [user.email]
        );

        if (existingGuest.length === 0) {
            // Hóspede não existe - CRIAR
            const tempDocument = `TEMP-${user.id}-${Date.now()}`;
            await pool.query(
                `INSERT INTO guests 
                 (user_id, name, email, document, email_verified, created_at)
                 VALUES (?, ?, ?, ?, TRUE, NOW())`,
                [user.id, user.name, user.email, tempDocument]
            );
            console.log(`✅ Hóspede criado para ${user.name} (user_id: ${user.id})`);
        } else {
            // Hóspede já existe - ATUALIZAR
            await pool.query(
                `UPDATE guests 
                 SET user_id = ?, name = ?, email = ?, email_verified = TRUE 
                 WHERE id = ?`,
                [user.id, user.name, user.email, existingGuest[0].id]
            );
            console.log(`✅ Hóspede atualizado (guest_id: ${existingGuest[0].id}) vinculado ao user_id: ${user.id}`);
        }

        // Gerar token de autenticação
        const authToken = jwt.sign(
            { id: user.id, email: user.email, role: 'hospede' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({ 
            message: 'Email confirmado com sucesso!',
            token: authToken,
            user: { id: user.id, name: user.name, email: user.email, role: 'hospede' }
        });

    } catch (error) {
        console.error('Erro na confirmação:', error);
        res.status(500).json({ error: 'Erro ao confirmar email' });
    }
};

// =====================================================
// REENVIAR LINK DE CONFIRMAÇÃO
// =====================================================
exports.resendVerification = async (req, res) => {
    try {
        const { email } = req.body;

        const [users] = await pool.query(
            `SELECT id, name, email_verified FROM users WHERE email = ?`,
            [email]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'Email não encontrado' });
        }

        const user = users[0];

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email já verificado' });
        }

        const newToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 1);

        await pool.query(
            `UPDATE users 
             SET verification_token = ?, verification_expires_at = ?
             WHERE id = ?`,
            [newToken, expiresAt, user.id]
        );

        const confirmationLink = `${process.env.FRONTEND_URL}/confirm-email?token=${newToken}`;
        await sendConfirmationEmail(email, user.name, confirmationLink);

        res.json({ message: 'Novo link de confirmação enviado!' });

    } catch (error) {
        console.error('Erro ao reenviar:', error);
        res.status(500).json({ error: 'Erro ao reenviar confirmação' });
    }
};