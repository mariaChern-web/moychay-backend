// server.js — Главный файл сервера Мойчай.ру

const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware (ТОЛЬКО ОДИН РАЗ!)
app.use(cors({
    origin: ['http://localhost:5000', 'https://cc963974.tw1.ru', 'https://moychay-backend-1.onrender.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// ====================== AUTH РОУТЫ ======================

// Регистрация
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Все поля обязательны' });
    }

    try {
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, hashedPassword, 'user']
        );

        res.status(201).json({ 
            message: 'Регистрация успешна', 
            user: result.rows[0] 
        });

    } catch (err) {
        console.error('Ошибка при регистрации:', err);
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    }
});

// Логин
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email и пароль обязательны' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Вход выполнен успешно',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error('Ошибка при входе:', err);
        res.status(500).json({ message: 'Ошибка сервера при входе' });
    }
});

// ====================== ОСТАЛЬНЫЕ РОУТЫ ======================

// Корзина
const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

// Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, category, price, stock, image, description
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

// Создать заказ из корзины
app.post('/api/orders', authenticateToken, async (req, res) => {
    const user_id = req.user.id;

    try {
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

        let total = 0;
        items.forEach(item => {
            total += parseFloat(item.price) * item.quantity;
        });

        const orderRes = await pool.query(
            'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3) RETURNING id',
            [user_id, total, 'pending']
        );

        const order_id = orderRes.rows[0].id;

        for (const item of items) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
                [order_id, item.product_id, item.quantity, item.price]
            );
        }

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

// Изменить статус заказа
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Недопустимый статус заказа' });
    }

    try {
        const orderCheck = await pool.query(
            'SELECT id, status FROM orders WHERE id = $1',
            [id]
        );

        if (orderCheck.rowCount === 0) {
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        const currentStatus = orderCheck.rows[0].status;

        if (currentStatus === status) {
            return res.json({ 
                success: true, 
                message: 'Статус заказа уже установлен',
                status: currentStatus
            });
        }

        const result = await pool.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        res.json({ 
            success: true, 
            message: 'Статус заказа успешно обновлён',
            order: result.rows[0]
        });

    } catch (err) {
        console.error('Ошибка при обновлении статуса заказа:', err);
        res.status(500).json({ message: 'Ошибка при обновлении статуса заказа' });
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
        res.status(500).json({ message: 'Ошибка при загрузке товаров заказа' });
    }
});

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
        const userResult = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [userId]
        );
        
        const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
        
        if (!validPassword) {
            return res.status(400).json({ message: 'Неверный текущий пароль' });
        }
        
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

// ====================== ЗАПУСК СЕРВЕРА ======================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log('✅ Роуты доступны:');
    console.log('   - POST   /api/auth/register');
    console.log('   - POST   /api/auth/login');
    console.log('   - GET    /api/products');
    console.log('   - GET    /api/cart');
    console.log('   - POST   /api/cart/add');
    console.log('   - GET    /api/users');
    console.log('   - PUT    /api/users/:id/role');
});