const router = require('express').Router();
const enquiryController = require('../controllers/enquiryController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, enquiryController.create);
router.get('/', authenticate, enquiryController.getAll);
router.get('/:id', authenticate, enquiryController.getById);

module.exports = router;