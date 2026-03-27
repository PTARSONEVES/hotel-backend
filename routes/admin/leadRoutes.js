const express = require('express');
const router = express.Router();
const leadController = require('../../controllers/public/leadController');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

// Todas as rotas abaixo exigem autenticação
router.use(authMiddleware);
//router.use(authorize.minimumRole('colaborador'));

router.get('/leads', authorize.minimumRole('colaborador'), leadController.getLeads);
router.get('/by-code/:code', authorize.minimumRole('colaborador'), leadController.getLeadByCode);
router.put('/leads/:id/status', authorize.minimumRole('colaborador'), leadController.updateLeadStatus);
router.post('/leads/:id/convert', authorize.minimumRole('colaborador'), leadController.convertLeadToBooking);

module.exports = router;