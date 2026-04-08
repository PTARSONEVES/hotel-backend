const cron = require('node-cron');
const alertController = require('../controllers/behaviorAlertController');

// Executar a cada hora
cron.schedule('0 * * * *', async () => {
    console.log('🕐 [' + new Date().toLocaleString() + '] Gerando alertas de comportamento...');
    try {
        const result = await alertController.generateAlerts({}, { json: () => {} });
        console.log(`✅ Gerados ${result.alerts_generated || 0} alertas de comportamento`);
    } catch (error) {
        console.error('❌ Erro ao gerar alertas:', error);
    }
});

console.log('⏰ Sistema de alertas de comportamento agendado (a cada hora)');