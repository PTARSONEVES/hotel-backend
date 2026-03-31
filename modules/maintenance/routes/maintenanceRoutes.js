const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../middleware/auth');
const authorize = require('../../../middleware/authorize');

const equipmentController = require('../controllers/equipmentController');
const workOrderController = require('../controllers/workOrderController');
const stockController = require('../controllers/stockController');
const reportsController = require('../controllers/maintenanceReportsController');
const materialCategoryController = require('../controllers/materialCategoryController');
const materialController = require('../controllers/materialController');
const stockMovementController = require('../controllers/stockMovementController');
const notificationController = require('../controllers/notificationController');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// Equipamentos
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

// Ordens de Serviço
router.get('/work-orders', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrders);
router.get('/work-orders/by-code/:code', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrderByCode);
router.get('/work-orders/:id', authorize.hasPermission('ver_manutencao'), workOrderController.getWorkOrderById);
router.post('/work-orders', authorize.hasPermission('criar_os'), workOrderController.createWorkOrder);
router.post('/work-orders/:id/start', authorize.hasPermission('executar_os'), workOrderController.startWorkOrder);
router.post('/work-orders/:id/complete', authorize.hasPermission('executar_os'), workOrderController.completeWorkOrder);
router.post('/work-orders/:id/cancel', authorize.hasPermission('executar_os'), workOrderController.cancelWorkOrder);

// Rotas para materiais na OS
router.get('/work-orders/:id/materials', authorize.hasPermission('executar_os'), workOrderController.getWorkOrderMaterials);
router.post('/work-orders/:id/materials', authorize.hasPermission('executar_os'), workOrderController.addMaterialToWorkOrder);
router.delete('/work-orders/:id/materials/:material_id', authorize.hasPermission('executar_os'), workOrderController.removeMaterialFromWorkOrder);

// Amoxarifado - Materiais
router.get('/materials', authorize.hasPermission('ver_almoxarifado'), stockController.getMaterials);
router.get('/materials/by-code/:code', authorize.hasPermission('ver_almoxarifado'), materialController.getMaterialByCode);
router.get('/materials/:id', authorize.hasPermission('ver_almoxarifado'), materialController.getMaterialById);
router.post('/materials', authorize.hasPermission('gerenciar_almoxarifado'), stockController.createMaterial);
router.put('/materials/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialController.updateMaterial);
router.delete('/materials/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialController.deleteMaterial);

// Movimentações de Estoque
router.get('/stock-movements', authorize.hasPermission('ver_almoxarifado'), stockMovementController.getMovements);
router.get('/stock-movements/material/:id/history', authorize.hasPermission('ver_almoxarifado'), stockMovementController.getMaterialHistory);
router.post('/stock/entry', authorize.hasPermission('gerenciar_almoxarifado'), stockController.addStockEntry);
router.post('/stock/exit', authorize.hasPermission('gerenciar_almoxarifado'), stockController.addStockExit);
router.post('/stock/inventory', authorize.hasPermission('gerenciar_almoxarifado'), stockController.doInventory);

// Categorias de materiais
router.get('/material-categories', authorize.hasPermission('ver_almoxarifado'), materialCategoryController.getCategories);
router.get('/material-categories/:id', authorize.hasPermission('ver_almoxarifado'), materialCategoryController.getCategoryById);
router.post('/material-categories', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.createCategory);
router.put('/material-categories/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.updateCategory);
router.delete('/material-categories/:id', authorize.hasPermission('gerenciar_almoxarifado'), materialCategoryController.deleteCategory);

// Relatórios e Indicadores
router.get('/reports/dashboard', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getDashboard);
router.get('/reports/indicators', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getIndicators);
router.get('/reports/material-consumption', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getMaterialConsumption);

// Rotas para gráficos
router.get('/reports/os-by-status', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getWorkOrdersByStatus);
router.get('/reports/monthly-costs', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getMonthlyCosts);
router.get('/reports/top-materials', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getTopMaterials);
router.get('/reports/top-equipment', authorize.hasPermission('ver_relatorios_manutencao'), reportsController.getTopEquipment);

// Notificações
router.get('/notifications', notificationController.getUserNotifications);
router.put('/notifications/:id/read', notificationController.markAsRead);
router.put('/notifications/read-all', notificationController.markAllAsRead);
router.delete('/notifications/:id', notificationController.deleteNotification);
router.post('/notifications/run-jobs', authorize.hasPermission('admin'), notificationController.runNotificationJobs);

module.exports = router;