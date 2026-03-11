const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../middleware/auth');
const roomTypeController = require('../controllers/roomTypeController');
const roomController = require('../controllers/roomController');
const guestController = require('../controllers/guestController');
const bookingController = require('../controllers/bookingController');
const consumptionController = require('../controllers/consumptionController');
const reportController = require('../controllers/reportController');

// Rota de teste pública (para verificar se o módulo está carregado)
router.get('/test', (req, res) => {
    res.json({ message: 'Módulo hotel funcionando!' });
});

// Rota de teste protegida
router.get('/test-auth', authMiddleware, (req, res) => {
    res.json({ message: 'Autenticação funcionando!', userId: req.userId });
});

// Rota para debug do token
router.get('/debug-token', authMiddleware, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    
    res.json({
        message: 'Token válido',
        userId: req.userId,
        tokenPreview: token.substring(0, 20) + '...',
        headers: req.headers
    });
});

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// =====================================================
// ROTAS DE TIPOS DE APARTAMENTO
// =====================================================
router.get('/room-types', roomTypeController.getRoomTypes);
router.post('/room-types', roomTypeController.createRoomType);
router.put('/room-types/:id', roomTypeController.updateRoomType);
router.delete('/room-types/:id', roomTypeController.deleteRoomType);

// =====================================================
// ROTAS DE APARTAMENTOS
// =====================================================
router.get('/rooms', roomController.getRooms);
router.get('/rooms/map', roomController.getRoomMap);
router.get('/rooms/:id', roomController.getRoomById);
router.post('/rooms', roomController.createRoom);
router.put('/rooms/:id', roomController.updateRoom);
router.patch('/rooms/:id/status', roomController.updateStatus);
router.delete('/rooms/:id', roomController.deleteRoom);

// =====================================================
// ROTAS DE HÓSPEDES
// =====================================================
router.get('/guests', guestController.getGuests);
router.get('/guests/:id', guestController.getGuestById);
router.get('/guests/document/:document', guestController.getGuestByDocument);
router.post('/guests', guestController.createGuest);
router.put('/guests/:id', guestController.updateGuest);
router.delete('/guests/:id', guestController.deleteGuest);

// =====================================================
// ROTAS DE RESERVAS
// =====================================================
router.get('/bookings', bookingController.getBookings);
router.get('/bookings/availability', bookingController.checkAvailability);
router.get('/bookings/:id', bookingController.getBookingById);
router.post('/bookings', bookingController.createBooking);
router.post('/bookings/:id/checkin', bookingController.checkIn);
router.post('/bookings/:id/checkout', bookingController.checkOut);
router.post('/bookings/:id/cancel', bookingController.cancelBooking);
router.post('/bookings/:id/consumption', bookingController.addConsumption);

// =====================================================
// ROTAS DE CONSUMO E ESTOQUE
// =====================================================
router.get('/categories', consumptionController.getCategories);
router.get('/products', consumptionController.getProducts);
router.post('/products', consumptionController.createProduct);
router.put('/products/:id', consumptionController.updateProduct);
router.post('/consumption', consumptionController.addConsumption);
router.post('/stock/entry', consumptionController.addStockEntry);
router.get('/stock/movements/:product_id', consumptionController.getProductMovements);
router.post('/bookings/:booking_id/close-bill', consumptionController.closeBookingBill);

// =====================================================
// ROTAS DE RELATÓRIOS
// =====================================================
router.get('/reports/occupancy', reportController.occupancyReport);
router.get('/reports/consumption', reportController.consumptionReport);
router.get('/reports/financial', reportController.financialReport);
router.get('/reports/executive-dashboard', reportController.executiveDashboard);

module.exports = router;