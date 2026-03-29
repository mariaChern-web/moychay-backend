// server.js — Главный файл сервера Мойчай.ру

const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ====================== AUTH MIDDLEWARE ======================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Не авторизован' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Неверный или истёкший токен' });
        }
        req.user = user;
        next();
    });
};

// ====================== РОУТЫ ======================

// Авторизация
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Корзина
const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

// ====================== АДМИН РОУТЫ ======================

// Получить все товары (для админ-панели)
app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, category, price, stock
            FROM products 
            ORDER BY category, name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении товаров:', err);
        res.status(500).json({ message: 'Ошибка при загрузке товаров' });
    }
});

// Обновить количество товара на складе
app.put('/api/products/:id/stock', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || isNaN(stock) || stock < 0) {
        return res.status(400).json({ message: 'Некорректное количество товара' });
    }

    try {
        const result = await pool.query(
            'UPDATE products SET stock = $1 WHERE id = $2 RETURNING *',
            [stock, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Товар не найден' });
        }

        res.json({ 
            success: true, 
            message: 'Количество товара успешно обновлено',
            product: result.rows[0]
        });
    } catch (err) {
        console.error('Ошибка при обновлении stock:', err);
        res.status(500).json({ message: 'Ошибка при обновлении количества товара' });
    }
});

// ====================== НОВЫЕ РОУТЫ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ======================

// Получить всех пользователей (для админ-панели)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, role, created_at 
            FROM users 
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении пользователей:', err);
        res.status(500).json({ message: 'Ошибка при загрузке пользователей' });
    }
});

// Изменить роль пользователя
app.put('/api/users/:id/role', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Недопустимая роль' });
    }

    try {
        const result = await pool.query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
            [role, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.json({ 
            success: true, 
            message: 'Роль пользователя успешно изменена',
            user: result.rows[0] 
        });
    } catch (err) {
        console.error('Ошибка при смене роли:', err);
        res.status(500).json({ message: 'Ошибка при изменении роли пользователя' });
    }
});

// ====================== ЗАКАЗЫ ======================

// Создать заказ из корзины
app.post('/api/orders', authenticateToken, async (req, res) => {
    const user_id = req.user.id;

    try {
        // Получаем корзину пользователя
        const cartRes = await pool.query(`
            SELECT ci.product_id, ci.quantity, p.price 
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = $1
        `, [user_id]);

        const items = cartRes.rows;

        if (items.length === 0) {
            return res.status(400).json({ message: 'Корзина пуста' });
        }

        // Считаем общую сумму
        let total = 0;
        items.forEach(item => {
            total += parseFloat(item.price) * item.quantity;
        });

        // Создаём заказ
        const orderRes = await pool.query(
            'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3) RETURNING id',
            [user_id, total, 'pending']
        );

        const order_id = orderRes.rows[0].id;

        // Добавляем товары в order_items
        for (const item of items) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
                [order_id, item.product_id, item.quantity, item.price]
            );
        }

        // Очищаем корзину пользователя
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [user_id]);

        res.json({ 
            success: true, 
            message: 'Заказ успешно создан', 
            order_id: order_id 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка при создании заказа' });
    }
});

// Получить все заказы (для админа)
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, u.name as user_name, u.email 
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка при загрузке заказов' });
    }
});

// server.js — Добавьте или замените существующий роут для обновления статуса заказа

// server.js — Исправленная версия роута для обновления статуса заказа (без updated_at)

// Изменить статус заказа
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    // Проверяем допустимые статусы
    const validStatuses = ['pending', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Недопустимый статус заказа' });
    }

    try {
        // Проверяем существование заказа и получаем его текущий статус
        const orderCheck = await pool.query(
            'SELECT id, status FROM orders WHERE id = $1',
            [id]
        );

        if (orderCheck.rowCount === 0) {
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        const currentStatus = orderCheck.rows[0].status;

        // Если статус уже такой же, ничего не делаем
        if (currentStatus === status) {
            return res.json({ 
                success: true, 
                message: 'Статус заказа уже установлен',
                status: currentStatus
            });
        }

        // Обновляем статус заказа (БЕЗ updated_at)
        const result = await pool.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        // Если новый статус "paid" — вычитаем товары со склада
        if (status === 'paid' && currentStatus !== 'paid') {
            // Получаем товары из заказа
            const items = await pool.query(
                `SELECT oi.product_id, oi.quantity, p.stock, p.name
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = $1`,
                [id]
            );

            let outOfStock = [];
            
            // Проверяем наличие на складе и списываем
            for (const item of items.rows) {
                if (item.stock < item.quantity) {
                    outOfStock.push({
                        name: item.name,
                        available: item.stock,
                        required: item.quantity
                    });
                }
            }
            
            // Если есть товары которых нет в наличии, возвращаем ошибку
            if (outOfStock.length > 0) {
                // Возвращаем статус обратно на pending
                await pool.query(
                    'UPDATE orders SET status = $1 WHERE id = $2',
                    ['pending', id]
                );
                
                return res.status(400).json({ 
                    message: 'Недостаточно товара на складе',
                    outOfStock: outOfStock
                });
            }
            
            // Списываем товары со склада
            for (const item of items.rows) {
                await pool.query(
                    'UPDATE products SET stock = stock - $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
        }
        
        // Если статус меняется с paid на другой, возвращаем товары на склад
        if (currentStatus === 'paid' && status !== 'paid') {
            const items = await pool.query(
                `SELECT oi.product_id, oi.quantity
                 FROM order_items oi
                 WHERE oi.order_id = $1`,
                [id]
            );
            
            // Возвращаем товары на склад
            for (const item of items.rows) {
                await pool.query(
                    'UPDATE products SET stock = stock + $1 WHERE id = $2',
                    [item.quantity, item.product_id]
                );
            }
        }

        res.json({ 
            success: true, 
            message: 'Статус заказа успешно обновлён',
            order: result.rows[0]
        });

    } catch (err) {
        console.error('Ошибка при обновлении статуса заказа:', err);
        res.status(500).json({ 
            message: 'Ошибка при обновлении статуса заказа',
            error: err.message 
        });
    }
});

// Получить товары конкретного заказа
app.get('/api/orders/:id/items', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(`
            SELECT oi.*, p.name, p.price as current_price
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [id]);

        // Форматируем данные для удобства
        const items = result.rows.map(item => ({
            id: item.id,
            product_id: item.product_id,
            name: item.name,
            quantity: item.quantity,
            price: item.price_at_purchase || item.current_price,
            price_at_purchase: item.price_at_purchase
        }));

        res.json(items);
    } catch (err) {
        console.error('Ошибка при получении товаров заказа:', err);
        res.status(500).json({ 
            message: 'Ошибка при загрузке товаров заказа',
            error: err.message 
        });
    }
});

// Создать заказ из корзины (исправленная версия)
app.post('/api/orders', authenticateToken, async (req, res) => {
    const user_id = req.user.id;

    try {
        // Получаем корзину пользователя
        const cartRes = await pool.query(`
            SELECT ci.product_id, ci.quantity, p.price, p.name 
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.user_id = $1
        `, [user_id]);

        const items = cartRes.rows;

        if (items.length === 0) {
            return res.status(400).json({ message: 'Корзина пуста' });
        }

        // Проверяем наличие товаров на складе
        let outOfStock = [];
        for (const item of items) {
            const stockRes = await pool.query(
                'SELECT stock, name FROM products WHERE id = $1',
                [item.product_id]
            );
            
            if (stockRes.rows[0].stock < item.quantity) {
                outOfStock.push({
                    name: stockRes.rows[0].name,
                    available: stockRes.rows[0].stock,
                    required: item.quantity
                });
            }
        }
        
        if (outOfStock.length > 0) {
            return res.status(400).json({
                message: 'Некоторые товары отсутствуют в нужном количестве',
                outOfStock: outOfStock
            });
        }

        // Считаем общую сумму
        let total = 0;
        items.forEach(item => {
            total += parseFloat(item.price) * item.quantity;
        });

        // Создаём заказ со статусом 'pending'
        const orderRes = await pool.query(
            'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3) RETURNING id',
            [user_id, total, 'pending']
        );

        const order_id = orderRes.rows[0].id;

        // Добавляем товары в order_items
        for (const item of items) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
                [order_id, item.product_id, item.quantity, item.price]
            );
        }

        // Очищаем корзину пользователя
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [user_id]);

        res.json({ 
            success: true, 
            message: 'Заказ успешно создан', 
            order_id: order_id 
        });

    } catch (err) {
        console.error('Ошибка при создании заказа:', err);
        res.status(500).json({ 
            message: 'Ошибка при создании заказа',
            error: err.message 
        });
    }
});

// Получить все заказы (для админа)
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.id, o.user_id, o.total, o.status, o.created_at, 
                   u.name as user_name, u.email 
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при загрузке заказов:', err);
        res.status(500).json({ message: 'Ошибка при загрузке заказов' });
    }
});


let subscribers = [];

// Подписка на рассылку (с сохранением в базу данных)
app.post('/api/subscribe', async (req, res) => {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ message: 'Пожалуйста, введите корректный email' });
    }
    
    try {
        // Проверяем, существует ли уже такой email
        const existing = await pool.query(
            'SELECT * FROM subscribers WHERE email = $1',
            [email]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: 'Вы уже подписаны на нашу рассылку!' });
        }
        
        // Добавляем подписчика
        await pool.query(
            'INSERT INTO subscribers (email) VALUES ($1)',
            [email]
        );
        
        console.log(`📧 Новый подписчик: ${email}`);
        
        res.json({ 
            success: true, 
            message: 'Спасибо за подписку! Скидка 10% на первый заказ уже ждёт вас на почте. ☕'
        });
        
    } catch (err) {
        console.error('Ошибка при подписке:', err);
        res.status(500).json({ message: 'Ошибка при подписке' });
    }
});

// Получить всех подписчиков (для админа)
app.get('/api/subscribers', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM subscribers ORDER BY subscribed_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении подписчиков:', err);
        res.status(500).json({ message: 'Ошибка при загрузке подписчиков' });
    }
});

// ====================== ЛИЧНЫЙ КАБИНЕТ ======================

// Получить данные текущего пользователя
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка получения данных пользователя:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Обновить данные пользователя
app.put('/api/user/update', authenticateToken, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role',
            [name, userId]
        );
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка обновления пользователя:', err);
        res.status(500).json({ message: 'Ошибка обновления' });
    }
});

// Смена пароля
app.put('/api/user/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Заполните все поля' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Пароль должен содержать минимум 6 символов' });
    }
    
    try {
        // Получаем текущий пароль пользователя
        const userResult = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [userId]
        );
        
        const bcrypt = require('bcryptjs');
        const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
        
        if (!validPassword) {
            return res.status(400).json({ message: 'Неверный текущий пароль' });
        }
        
        // Хешируем новый пароль
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );
        
        res.json({ message: 'Пароль успешно изменен' });
    } catch (err) {
        console.error('Ошибка смены пароля:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получить заказы пользователя
app.get('/api/orders/user', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения заказов:', err);
        res.status(500).json({ message: 'Ошибка загрузки заказов' });
    }
});

// Избранное: получить список
app.get('/api/favorites', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    
    try {
        const result = await pool.query(`
            SELECT f.*, p.name, p.price, p.image 
            FROM favorites f
            JOIN products p ON f.product_id = p.id
            WHERE f.user_id = $1
        `, [userId]);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения избранного:', err);
        res.status(500).json({ message: 'Ошибка загрузки избранного' });
    }
});

// Избранное: добавить
app.post('/api/favorites', authenticateToken, async (req, res) => {
    const { product_id } = req.body;
    const userId = req.user.id;
    
    try {
        // Проверяем, не добавлен ли уже
        const existing = await pool.query(
            'SELECT * FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, product_id]
        );
        
        if (existing.rowCount > 0) {
            return res.status(400).json({ message: 'Товар уже в избранном' });
        }
        
        await pool.query(
            'INSERT INTO favorites (user_id, product_id) VALUES ($1, $2)',
            [userId, product_id]
        );
        
        res.json({ message: 'Товар добавлен в избранное' });
    } catch (err) {
        console.error('Ошибка добавления в избранное:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Избранное: удалить
app.delete('/api/favorites/:productId', authenticateToken, async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    
    try {
        await pool.query(
            'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );
        
        res.json({ message: 'Товар удален из избранного' });
    } catch (err) {
        console.error('Ошибка удаления из избранного:', err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// ====================== ЗАПУСК СЕРВЕРА ======================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log('✅ Роуты доступны:');
    console.log('   - POST   /api/auth/register');
    console.log('   - POST   /api/auth/login');
    console.log('   - GET    /api/cart');
    console.log('   - POST   /api/cart/add');
    console.log('   - GET    /api/products');
    console.log('   - PUT    /api/products/:id/stock');
    console.log('   - GET    /api/users');
    console.log('   - PUT    /api/users/:id/role');
});