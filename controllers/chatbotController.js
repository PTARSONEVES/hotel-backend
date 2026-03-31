const pool = require('../config/database');

// =====================================================
// PROCESSAR MENSAGEM DO CHATBOT
// =====================================================
exports.processMessage = async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        const lowerMsg = message.toLowerCase().trim();
        
        // Detectar intenção
        let intent = 'unknown';
        let response = '';
        let options = [];
        
        // Intenções
        if (lowerMsg.includes('reserva') || lowerMsg === '1' || lowerMsg.includes('reservar')) {
            intent = 'reserva';
            response = 'Para fazer uma reserva, por favor informe:\n\n📅 Data de check-in:\n📅 Data de check-out:\n👥 Número de pessoas:\n🏠 Tipo de flat desejado:\n\nPosso ajudar com mais alguma informação?';
            options = [
                { text: '📅 Ver disponibilidade', action: 'availability' },
                { text: '🏠 Tipos de flats', action: 'flats' },
                { text: '💰 Preços', action: 'prices' },
                { text: '👨‍💼 Falar com atendente', action: 'human' }
            ];
        } 
        else if (lowerMsg.includes('flat') || lowerMsg === '2') {
            intent = 'flats';
            response = 'Nossos flats:\n\n🏠 **Standard** - R$ 350/diária\n   • 35m², ar condicionado, TV, frigobar\n\n🌟 **Luxo** - R$ 550/diária\n   • 50m², hidromassagem, varanda\n\n👑 **Master** - R$ 750/diária\n   • 70m², cozinha americana, sala\n\n👨‍👩‍👧‍👦 **Família** - R$ 850/diária\n   • 85m², 2 quartos, cozinha completa\n\nQual tipo você tem interesse?';
            options = [
                { text: '📅 Ver disponibilidade', action: 'availability' },
                { text: '💰 Preços especiais', action: 'prices' },
                { text: '👨‍💼 Falar com atendente', action: 'human' }
            ];
        }
        else if (lowerMsg.includes('preço') || lowerMsg === '4' || lowerMsg.includes('valor') || lowerMsg.includes('custo')) {
            intent = 'prices';
            response = 'Promoções especiais! 🎁\n\n• **15% OFF** para reservas com 30 dias de antecedência\n• **Pacote Romântico**: 3 diárias + jantar especial (R$ 1.800)\n• **Desconto para grupos**: 10% para 4+ pessoas\n• **Pacote Família**: 5 diárias + café da manhã (R$ 3.500)\n\nGostaria de saber mais sobre alguma promoção?';
            options = [
                { text: '📅 Fazer reserva', action: 'booking' },
                { text: '🏠 Ver flats', action: 'flats' },
                { text: '👨‍💼 Falar com atendente', action: 'human' }
            ];
        }
        else if (lowerMsg.includes('porto') || lowerMsg === '3') {
            intent = 'porto';
            response = 'Porto de Galinhas é um paraíso! 🏖️\n\n**Principais atrações:**\n\n🔹 **Piscinas Naturais**\n   • Melhor horário: maré baixa\n   • Passeio de jangada\n   • Snorkeling com peixes\n\n🔹 **Praia de Muro Alto**\n   • Águas calmas e cristalinas\n   • Piscinas naturais\n   • Estrutura de quiosques\n\n🔹 **Pontal de Maracaípe**\n   • Pôr do sol espetacular\n   • Surfe\n   • Restaurantes à beira-mar\n\n🔹 **Praia dos Carneiros**\n   • Capela histórica\n   • Passeios de catamarã\n   • Coqueirais\n\nQual atração você gostaria de conhecer mais?';
            options = [
                { text: '🏖️ Piscinas Naturais', action: 'pools' },
                { text: '🏄 Pontal de Maracaípe', action: 'surf' },
                { text: '⛪ Praia dos Carneiros', action: 'carneiros' },
                { text: '👨‍💼 Falar com atendente', action: 'human' }
            ];
        }
        else if (lowerMsg.includes('check-in') || lowerMsg.includes('check-out') || lowerMsg.includes('horário')) {
            intent = 'schedule';
            response = 'Horários do resort:\n\n🕐 **Check-in**: 14:00\n🕛 **Check-out**: 12:00\n\nCaso necessário, podemos oferecer early check-in ou late check-out sujeito à disponibilidade.\n\nGostaria de solicitar?';
            options = [
                { text: '📅 Solicitar early check-in', action: 'early' },
                { text: '📅 Solicitar late check-out', action: 'late' },
                { text: '👨‍💼 Falar com atendente', action: 'human' }
            ];
        }
        else if (lowerMsg.includes('cancela') || lowerMsg.includes('cancelamento')) {
            intent = 'cancellation';
            response = 'Política de cancelamento:\n\n• Cancelamento com até 7 dias de antecedência: **reembolso integral**\n• Cancelamento entre 3 e 7 dias: **50% de reembolso**\n• Cancelamento em menos de 3 dias: **sem reembolso**\n\nGostaria de cancelar uma reserva?';
            options = [
                { text: '✅ Sim, quero cancelar', action: 'cancel' },
                { text: '📞 Falar com atendente', action: 'human' },
                { text: '🔙 Voltar ao menu', action: 'menu' }
            ];
        }
        else if (lowerMsg.includes('ajuda') || lowerMsg === '0' || lowerMsg.includes('menu')) {
            intent = 'menu';
            response = 'Como posso ajudar você hoje? Selecione uma opção:\n\n1️⃣ - Reservas\n2️⃣ - Conhecer nossos flats\n3️⃣ - Informações sobre Porto de Galinhas\n4️⃣ - Promoções e preços\n5️⃣ - Horários check-in/check-out\n6️⃣ - Política de cancelamento\n\nDigite o número da opção desejada ou sua pergunta.';
            options = [
                { text: '1️⃣ Reservas', action: 'reserva' },
                { text: '2️⃣ Flats', action: 'flats' },
                { text: '3️⃣ Porto de Galinhas', action: 'porto' },
                { text: '4️⃣ Promoções', action: 'prices' },
                { text: '5️⃣ Horários', action: 'schedule' },
                { text: '6️⃣ Cancelamento', action: 'cancellation' }
            ];
        }
        else if (lowerMsg.includes('atendente') || lowerMsg.includes('humano') || lowerMsg === '5') {
            intent = 'human';
            response = 'Vou conectar você com um de nossos atendentes pelo WhatsApp.\n\nClique no botão abaixo para iniciar a conversa.';
            options = [
                { text: '📱 Falar no WhatsApp', action: 'whatsapp' },
                { text: '🔙 Voltar ao menu', action: 'menu' }
            ];
        }
        else {
            intent = 'unknown';
            response = 'Desculpe, não entendi sua mensagem. 🤔\n\nPor favor, digite uma das opções abaixo ou "ajuda" para ver o menu completo.\n\n1️⃣ - Reservas\n2️⃣ - Flats\n3️⃣ - Porto de Galinhas\n4️⃣ - Promoções\n5️⃣ - Falar com atendente';
            options = [
                { text: '1️⃣ Reservas', action: 'reserva' },
                { text: '2️⃣ Flats', action: 'flats' },
                { text: '3️⃣ Porto de Galinhas', action: 'porto' },
                { text: '4️⃣ Promoções', action: 'prices' },
                { text: '5️⃣ Falar com atendente', action: 'human' }
            ];
        }
        
        // Salvar conversa no banco (opcional)
        await pool.query(
            `INSERT INTO chatbot_conversations 
             (session_id, message, response, intent, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [sessionId, message, response, intent]
        );
        
        res.json({
            success: true,
            response,
            intent,
            options,
            escalate: intent === 'human'
        });
        
    } catch (error) {
        console.error('Erro no chatbot:', error);
        res.status(500).json({ error: 'Erro ao processar mensagem' });
    }
};

// =====================================================
// SALVAR AVALIAÇÃO DO CHATBOT
// =====================================================
exports.saveFeedback = async (req, res) => {
    try {
        const { sessionId, rating, feedback } = req.body;
        
        await pool.query(
            `UPDATE chatbot_conversations 
             SET rating = ?, feedback = ? 
             WHERE session_id = ? AND rating IS NULL
             ORDER BY created_at DESC LIMIT 1`,
            [rating, feedback, sessionId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao salvar feedback:', error);
        res.status(500).json({ error: 'Erro ao salvar feedback' });
    }
};