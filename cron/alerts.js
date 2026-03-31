const cron = require('node-cron');
const alertController = require('../modules/hotel/controllers/alertController');
const notificationController = require('../modules/maintenance/controllers/notificationController');

// Executar todos os dias às 6:00 e 18:00
cron.schedule('0 6,18 * * *', async () => {
    console.log('🕐 [' + new Date().toLocaleString() + '] Gerando alertas...');
    try {
        // Alertas do hotel
        const upcoming = await alertController.generateUpcomingCheckinAlerts();
        const overdue = await alertController.generateOverdueCheckinAlerts();
        const payments = await alertController.generateOverduePaymentAlerts();

        // Notificações de manutenção
        const lowStock = await notificationController.generateLowStockNotifications();
        const overdueOS = await notificationController.generateOverdueOSNotifications();        

        console.log(`✅ Alertas gerados: ${upcoming + overdue + payments}`);
        console.log(`✅ Notificações: Estoque Baixo: ${lowStock}, OS Atrasadas: ${overdueOS}`);
    } catch (error) {
        console.error('❌ Erro no cron job:', error);
    }
});

// Verificação a cada 4 horas durante o dia
cron.schedule('0 */4 * * *', async () => {
    console.log('🕐 [' + new Date().toLocaleString() + '] Verificação rápida...');
    await notificationController.generateOverdueOSNotifications();
});


console.log('⏰ Sistema de alertas e notificações agendado (6:00 e 18:00)');