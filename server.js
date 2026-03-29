// server.js — Минимальная рабочая версия для Railway

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const pool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Middleware авторизации
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Не авторизован' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'moychay2026supersecretkey', (err, user) => {
        if (err) return res.status(403).json({ message: 'Неверный токен' });
        req.user = user;
        next();
    });
};

// Подключаем роуты
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cart');

app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);

// Простой тестовый роут
app.get('/', (req, res) => {
    res.json({ message: '✅ Мойчай backend работает на Railway!' });
});

// ====================== ЗАПУСК ======================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер успешно запущен на порту ${PORT}`);
    console.log(`🌐 Адрес: https://moychay-backend-1.onrender.com`);
    console.log('✅ Backend готов принимать запросы');
});

console.log('Сервер инициализирован');