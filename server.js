// server.js — Диагностическая версия (без базы данных)

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: "ok", 
        message: "✅ Тестовый сервер работает. База данных отключена." 
    });
});

app.get('/api/test', (req, res) => {
    res.json({ message: "Тестовый роут работает" });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Тестовый сервер запущен на порту ${PORT}`);
    console.log(`🌐 Адрес: https://moychay-backend-1.onrender.com`);
    console.log('✅ Backend готов (без подключения к БД)');
});

console.log('Сервер инициализирован — диагностическая версия');