const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/register',
    [
        body('name').notEmpty().withMessage('Nome é obrigatório'),
        body('email').isEmail().withMessage('Email inválido'),
        body('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
    ],
    authController.register
);

router.post('/login',
    [
        body('email').isEmail().withMessage('Email inválido'),
        body('password').notEmpty().withMessage('Senha é obrigatória')
    ],
    authController.login
);

module.exports = router;