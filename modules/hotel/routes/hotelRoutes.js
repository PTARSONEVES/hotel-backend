const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../middleware/auth');
const authorize = require('../../../middleware/authorize');
const roomTypeController = require('../controllers/roomTypeController');
const roomController = require('../controllers/roomController');
const guestController = require('../controllers/guestController');
const bookingController = require('../controllers/bookingController');
const alertController = require('../controllers/alertController');
const consumptionController = require('../controllers/consumptionController');
const reportController = require('../controllers/reportController');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// =====================================================
// ROTAS DE TIPOS DE APARTAMENTO
// =====================================================
router.get('/room-types', roomTypeController.getRoomTypes);
router.get('/room-types/:id', roomTypeController.getRoomTypeById);
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
router.get('/rooms/by-code/:code', roomController.getRoomByCode);

// =====================================================
// ROTAS DE HÓSPEDES
// =====================================================
router.get('/guests', guestController.getGuests);
router.get('/guests/by-user/:userId', guestController.getGuestByUserId);
router.get('/guests/:id', guestController.getGuestById);
router.get('/guests/document/:document', guestController.getGuestByDocument);
router.post('/guests', guestController.createGuest);
router.put('/guests/:id', guestController.updateGuest);
router.delete('/guests/:id', guestController.deleteGuest);
router.get('/by-code/:code', guestController.getGuestByOperationCode);

// =====================================================
// ROTAS DE RESERVAS (ATUALIZADAS)
// =====================================================
router.get('/bookings/availability', bookingController.checkAvailability);  // <-- DEVE VIR ANTES DE /bookings/:id
router.get('/bookings', bookingController.getBookings);  // <-- DEVE ESTAR ASSIM
router.get('/bookings/:id', bookingController.getBookingById);
router.get('/bookings/:id/logs', authorize.canEditBookings, bookingController.getBookingLogs);
router.get('/bookings/by-code/:code', bookingController.getBookingByCode);
router.post('/bookings', bookingController.createBooking);
router.put('/bookings/:id', authorize.canEditBookings, bookingController.updateBooking);  // <-- PROTEÇÃO
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

// =====================================================
// ROTAS DE PARCELAS
// =====================================================
router.get('/bookings/:booking_id/installments', bookingController.getBookingInstallments);
router.post('/installments/:installment_id/pay', bookingController.payInstallment);

// =====================================================
// ROTAS DE ALERTAS
// =====================================================
router.get('/alerts', alertController.getActiveAlerts);
router.post('/alerts/generate', alertController.generateAllAlerts);
router.post('/alerts/:id/resolve', alertController.resolveAlert);

module.exports = router;