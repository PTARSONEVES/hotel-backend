const express = require('express');
const router = express.Router();
const leadController = require('../../controllers/public/leadController');
const authMiddleware = require('../../middleware/auth');

// Todas as rotas abaixo exigem autenticação
router.use(authMiddleware);

router.get('/leads', leadController.getLeads);
router.put('/leads/:id/status', leadController.updateLeadStatus);
router.post('/leads/:id/convert', leadController.convertLeadToBooking);

module.exports = router;