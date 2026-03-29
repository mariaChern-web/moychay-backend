// project-backend/routes/cart.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware проверки JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Не авторизован' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Неверный токен' });
        req.user = user;
        next();
    });
};

// Получить корзину пользователя
router.get('/', authenticateToken, async (req, res) => {
    try {
        console.log(`Получение корзины для пользователя ID: ${req.user.id}`);

        const result = await pool.query(`
            SELECT 
                ci.id as cart_id,
                ci.quantity,
                p.id as product_id,
                p.name,
                p.price
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = $1
            ORDER BY ci.created_at DESC
        `, [req.user.id]);

        console.log(`Найдено товаров в корзине: ${result.rows.length}`);
        res.json(result.rows);

    } catch (err) {
        console.error('Ошибка при получении корзины:', err);
        res.status(500).json({ 
            message: 'Ошибка при получении корзины',
            error: err.message 
        });
    }
});

// Добавить товар в корзину
router.post('/add', authenticateToken, async (req, res) => {
    const { product_id, quantity = 1 } = req.body;
    const user_id = req.user.id;

    try {
        await pool.query(`
            INSERT INTO cart_items (user_id, product_id, quantity)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, product_id) 
            DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        `, [user_id, product_id, quantity]);

        res.json({ success: true, message: 'Товар добавлен в корзину' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Ошибка при добавлении товара' });
    }
});

// Обновить количество
router.put('/update', authenticateToken, async (req, res) => {
    const { product_id, quantity } = req.body;
    const user_id = req.user.id;

    if (quantity < 1) return res.status(400).json({ success: false, message: 'Количество должно быть > 0' });

    try {
        const result = await pool.query(`
            UPDATE cart_items SET quantity = $1 
            WHERE user_id = $2 AND product_id = $3
            RETURNING *
        `, [quantity, user_id, product_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Товар не найден в корзине' });
        }

        res.json({ success: true, message: 'Количество обновлено' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Ошибка обновления' });
    }
});

// Удалить товар
router.delete('/remove/:product_id', authenticateToken, async (req, res) => {
    const user_id = req.user.id;
    const product_id = parseInt(req.params.product_id);

    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', 
            [user_id, product_id]);
        res.json({ success: true, message: 'Товар удалён' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Ошибка при удалении' });
    }
});

// Очистить корзину
router.delete('/clear', authenticateToken, async (req, res) => {
    const user_id = req.user.id;
    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [user_id]);
        res.json({ success: true, message: 'Корзина очищена' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Ошибка очистки' });
    }
});

module.exports = router;