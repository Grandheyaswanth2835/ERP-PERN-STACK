const router = require('express').Router();
const quotationController = require('../controllers/quotationController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/', authenticate, authorize('SALES_USER', 'ADMIN'), quotationController.create);
router.get('/', authenticate, quotationController.getAll);
router.get('/:id', authenticate, quotationController.getById);
router.patch('/:id/status', authenticate, authorize('SALES_USER', 'ADMIN'), quotationController.updateStatus);
router.post('/:id/convert', authenticate, authorize('SALES_USER', 'ADMIN'), quotationController.convert);

module.exports = router;