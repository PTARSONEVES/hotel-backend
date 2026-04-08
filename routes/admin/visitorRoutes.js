const express = require('express');
const router = express.Router();
const visitorController = require('../../controllers/visitorController');
const authMiddleware = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');

router.use(authMiddleware);
router.use(authorize.minimumRole('admin'));

router.get('/dashboard', visitorController.getDashboard);
router.get('/:id', visitorController.getVisitorDetails);
router.post('/:id/convert', visitorController.convertToLead);

module.exports = router;