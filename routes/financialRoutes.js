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
router.put('/receivables/:id', authorize.hasPermission('editar_conta'), financialController.updateReceivable);
router.delete('/receivables/:id', authorize.hasPermission('excluir_conta'), financialController.deleteReceivable);

// Contas a Pagar
router.get('/bills', authorize.hasPermission('ver_todas_contas'), financialController.getBills);
router.post('/bills', authorize.hasPermission('criar_conta'), financialController.createBill);
router.put('/bills/:id/pay', authorize.hasPermission('gerenciar_pagamentos'), financialController.payBill);
router.put('/bills/:id', authorize.hasPermission('editar_conta'), financialController.updateBill);
router.delete('/bills/:id', authorize.hasPermission('excluir_conta'), financialController.deleteBill);

// Relatórios
router.get('/reports', authorize.hasPermission('ver_relatorios_financeiros'), financialController.getReport);

// Categorias
router.get('/categories', financialController.getCategories);

module.exports = router;