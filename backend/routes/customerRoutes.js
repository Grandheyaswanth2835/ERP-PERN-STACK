const router = require('express').Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, customerController.create);
router.get('/', authenticate, customerController.getAll);
router.get('/:id', authenticate, customerController.getById);

module.exports = router;