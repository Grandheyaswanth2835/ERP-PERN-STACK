const router = require('express').Router();
const productController = require('../controllers/productController');
const inventoryController = require('../controllers/inventoryController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, productController.getAll);
router.get('/inventory/all', authenticate, inventoryController.getInventory);
router.patch('/inventory/:id', authenticate, authorize('ADMIN'), inventoryController.updateInventory);
router.get('/:id', authenticate, productController.getById);
router.post('/', authenticate, authorize('ADMIN'), productController.create);

module.exports = router;