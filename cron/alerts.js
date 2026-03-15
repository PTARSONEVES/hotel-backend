const cron = require('node-cron');
const alertController = require('../modules/hotel/controllers/alertController');

// Executar todos os dias às 6:00 e 18:00
cron.schedule('0 6,18 * * *', async () => {
    console.log('🕐 [' + new Date().toLocaleString() + '] Gerando alertas...');
    try {
        const upcoming = await alertController.generateUpcomingCheckinAlerts();
        const overdue = await alertController.generateOverdueCheckinAlerts();
        const payments = await alertController.generateOverduePaymentAlerts();
        
        console.log(`✅ Alertas gerados: ${upcoming + overdue + payments}`);
    } catch (error) {
        console.error('❌ Erro no cron job:', error);
    }
});

console.log('⏰ Sistema de alertas agendado (6:00 e 18:00)');