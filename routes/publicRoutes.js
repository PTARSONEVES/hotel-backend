const express = require('express');
const router = express.Router();
const leadController = require('../controllers/public/leadController');

// Rotas públicas (NÃO exigem autenticação)
router.post('/leads', leadController.createLead);
router.post('/leads/auto-respond', leadController.sendAutoResponder);

// =====================================================
// SALVAR INTERAÇÃO DO WHATSAPP
// =====================================================
router.post('/whatsapp/interaction', async (req, res) => {
    try {
        const { phone, name, message, option_selected } = req.body;
        
        // Verificar se já existe lead com este telefone
        const [existing] = await pool.query(
            'SELECT id FROM leads WHERE phone = ?',
            [phone]
        );
        
        if (existing.length === 0) {
            // Criar novo lead
            await pool.query(
                `INSERT INTO leads 
                 (name, phone, source, status, notes, created_at)
                 VALUES (?, ?, 'whatsapp', 'novo', ?, NOW())`,
                [name || 'Visitante WhatsApp', phone, `Interação via WhatsApp - Opção: ${option_selected || 'N/A'} - Mensagem: ${message?.substring(0, 200)}`]
            );
        } else {
            // Atualizar lead existente
            await pool.query(
                `UPDATE leads 
                 SET notes = CONCAT(notes, '\n[', NOW(), '] Interação WhatsApp: ', ?),
                     updated_at = NOW()
                 WHERE id = ?`,
                [`Opção: ${option_selected || 'N/A'} - Mensagem: ${message?.substring(0, 200)}`, existing[0].id]
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao salvar interação:', error);
        res.status(500).json({ error: 'Erro ao salvar interação' });
    }
});

// =====================================================
// WEBHOOK WHATSAPP (para testes)
// =====================================================
router.post('/whatsapp/webhook', async (req, res) => {
    try {
        const { message, from, name } = req.body;
        
        console.log(`📱 Mensagem recebida de ${from} (${name}): ${message}`);
        
        // Resposta automática simples
        let autoReply = '';
        const lowerMsg = message.toLowerCase();
        
        if (lowerMsg.includes('reserva') || lowerMsg === '1') {
            autoReply = 'Para fazer uma reserva, por favor informe:\n' +
                        '📅 Data de check-in:\n' +
                        '📅 Data de check-out:\n' +
                        '👥 Número de pessoas:\n' +
                        '🏠 Tipo de flat desejado:\n\n' +
                        'Em breve um atendente entrará em contato!';
        } else if (lowerMsg.includes('flat') || lowerMsg === '2') {
            autoReply = 'Nossos flats:\n\n' +
                        '🏠 Standard - R$ 350/diária\n' +
                        '🌟 Luxo - R$ 550/diária\n' +
                        '👑 Master - R$ 750/diária\n' +
                        '👨‍👩‍👧‍👦 Família - R$ 850/diária\n\n' +
                        'Qual tipo você tem interesse?';
        } else if (lowerMsg.includes('porto') || lowerMsg === '3') {
            autoReply = 'Porto de Galinhas é um paraíso! 🏖️\n\n' +
                        'Principais atrações:\n' +
                        '• Piscinas Naturais (melhor horário: maré baixa)\n' +
                        '• Praia de Muro Alto (águas calmas)\n' +
                        '• Pontal de Maracaípe (pôr do sol e surfe)\n' +
                        '• Praia dos Carneiros (capela histórica)\n\n' +
                        'Gostaria de saber mais sobre alguma?';
        } else if (lowerMsg.includes('promo') || lowerMsg === '4') {
            autoReply = 'Promoções especiais! 🎁\n\n' +
                        '• 15% OFF para reservas com 30 dias de antecedência\n' +
                        '• Pacote Romântico: 3 diárias + jantar especial\n' +
                        '• Desconto para grupos: 10% para 4+ pessoas\n\n' +
                        'Gostaria de saber mais?';
        } else {
            autoReply = 'Obrigado pelo contato! Em breve um de nossos atendentes responderá.\n\n' +
                        'Enquanto isso, você pode:\n' +
                        '1️⃣ - Fazer uma reserva\n' +
                        '2️⃣ - Conhecer nossos flats\n' +
                        '3️⃣ - Informações sobre Porto de Galinhas\n' +
                        '4️⃣ - Promoções\n\n' +
                        'Digite o número da opção desejada.';
        }
        
        // Salvar no banco
        await pool.query(
            `INSERT INTO whatsapp_messages 
             (from_number, from_name, message, reply, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [from, name || 'Visitante', message, autoReply]
        );
        
        res.json({ 
            success: true, 
            reply: autoReply,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).json({ error: 'Erro no webhook' });
    }
});

module.exports = router;