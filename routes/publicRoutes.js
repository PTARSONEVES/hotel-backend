const express = require('express');
const router = express.Router();
const leadController = require('../controllers/public/leadController');

// Rotas públicas (NÃO exigem autenticação)
router.post('/leads', leadController.createLead);
router.post('/leads/auto-respond', leadController.sendAutoResponder);

module.exports = router;