const express = require('express');
const router = express.Router();
const alertController = require('../../controllers/behaviorAlertController');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

router.use(authMiddleware);
router.use(authorize.minimumRole('admin'));

router.get('/behavior-alerts', alertController.getAlerts);
router.post('/behavior-alerts/generate', alertController.generateAlerts);
router.put('/behavior-alerts/:id/read', alertController.markAsRead);
router.put('/behavior-alerts/read-all', alertController.markAllAsRead);

module.exports = router;