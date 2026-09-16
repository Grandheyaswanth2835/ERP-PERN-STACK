const router = require('express').Router();
const salesOrderController = require('../controllers/salesOrderController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, salesOrderController.getAll);
router.get('/dispatches/list', authenticate, salesOrderController.getDispatches);
router.get('/:id', authenticate, salesOrderController.getById);
router.post('/:id/confirm', authenticate, authorize('ADMIN'), salesOrderController.confirm);
router.post('/:id/cancel', authenticate, authorize('ADMIN'), salesOrderController.cancel);
router.post('/:id/dispatch', authenticate, authorize('ADMIN'), salesOrderController.dispatch);

module.exports = router;