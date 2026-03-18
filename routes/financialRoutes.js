const express = require('express');
const router = express.Router();
const financialController = require('../controllers/financialController');
const authMiddleware = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// Dashboard
router.get('/dashboard', authorize.hasPermission('ver_relatorios_financeiros'), financialController.getDashboard);

// Contas a Receber
router.get('/receivables', authorize.hasPermission('ver_todas_contas'), financialController.getReceivables);

// Contas a Pagar
router.get('/bills', authorize.hasPermission('ver_todas_contas'), financialController.getBills);
router.post('/bills', authorize.hasPermission('criar_conta'), financialController.createBill);
router.put('/bills/:id/pay', authorize.hasPermission('gerenciar_pagamentos'), financialController.payBill);

// Relatórios
router.get('/reports', authorize.hasPermission('ver_relatorios_financeiros'), financialController.getReport);

// Categorias
router.get('/categories', financialController.getCategories);

module.exports = router;