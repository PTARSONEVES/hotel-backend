const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../middleware/auth');
const authorize = require('../../../middleware/authorize');

const equipmentController = require('../controllers/equipmentController');
const workOrderController = require('../controllers/workOrderController');
const stockController = require('../controllers/stockController');
const reportsController = require('../controllers/maintenanceReportsController');
const materialCategoryController = require('../controllers/materialCategoryController');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// =====================================================
// EQUIPAMENTOS
// =====================================================
router.get('/equipment', authorize.hasPermission('ver_manutencao'), equipmentController.getEquipment);
router.get('/equipment/by-code/:code', authorize.hasPermission('ver_manutencao'), equipmentController.getEquipmentByCode);
router.get('/equipment/:id', authorize.hasPermission('ver_manutencao'), equipmentController.getEquipmentById);
router.post('/equipment', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.createEquipment);
router.put('/equipment/:id', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.updateEquipment);
router.delete('/equipment/:id', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.deleteEquipment);

// Categorias de equipamentos
router.get('/equipment-categories', authorize.hasPermission('ver_manutencao'), equipmentController.getEquipmentCategories);
router.post('/equipment-categories', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.createEquipmentCategory);
router.put('/equipment-categories/:id', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.updateEquipmentCategory);
router.delete('/equipment-categories/:id', authorize.hasPermission('gerenciar_equipamentos'), equipmentController.deleteEquipmentCategory);

// =====================================================
// ORDENS DE SERVIÇO
// =====================================================
router.get('/work-orders', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrders);
router.get('/work-orders/by-code/:code', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrderByCode);
router.get('/work-orders/:id', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrderById);
router.post('/work-orders', authorize.hasPermission('criar_os'), workOrderController.createWorkOrder);
router.post('/work-orders/:id/start', authorize.hasPermission('executar_os'), workOrderController.startWorkOrder);
router.post('/work-orders/:id/complete', authorize.hasPermission('executar_os'), workOrderController.completeWorkOrder);
router.post('/work-orders/:id/cancel', authorize.hasPermission('executar_os'), workOrderController.cancelWorkOrder);

// =====================================================
// ALMOXARIFADO
// =====================================================
router.get('/materials', authorize.hasPermission('ver_almoxarifado'), stockController.getMaterials);
router.post('/materials', authorize.hasPermission('gerenciar_almoxarifado'), stockController.createMaterial);
router.post('/stock/entry', authorize.hasPermission('gerenciar_almoxarifado'), stockController.addStockEntry);
router.post('/stock/exit', authorize.hasPermission('gerenciar_almoxarifado'), stockController.addStockExit);
router.post('/stock/inventory', authorize.hasPermission('gerenciar_almoxarifado'), stockController.doInventory);

// Categorias de materiais
router.get('/material-categories', authorize.hasPermission('ver_almoxarifado'), materialCategoryController.getCategories);
router.get('/material-categories/:id', authorize.hasPermission('ver_almoxarifado'), materialCategoryController.getCategoryById);
router.post('/material-categories', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.createCategory);
router.put('/material-categories/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.updateCategory);
router.delete('/material-categories/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.deleteCategory);

// =====================================================
// RELATÓRIOS E INDICADORES
// =====================================================
router.get('/reports/dashboard', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getDashboard);
router.get('/reports/indicators', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getIndicators);
router.get('/reports/material-consumption', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getMaterialConsumption);

module.exports = router;