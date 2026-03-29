const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const register = async (req, res) => {
  const { email, password, name, phone, address } = req.body;

  console.log("📥 Получен запрос на регистрацию:", { email, name }); // ← для отладки

  if (!email || !password) {
    return res.status(400).json({ message: 'Email и пароль обязательны' });
  }

  try {
    // Проверка существующего пользователя
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Пользователь уже существует' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, address, role)
       VALUES ($1, $2, $3, $4, $5, 'user')
       RETURNING id, email, name, role`,
      [email, hashedPassword, name || null, phone || null, address || null]
    );

    const user = newUser.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    console.log("✅ Пользователь успешно зарегистрирован:", email);

    res.status(201).json({
      message: 'Регистрация успешна',
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });

  } catch (err) {
    console.error("❌ ОШИБКА ПРИ РЕГИСТРАЦИИ:");
    console.error(err);                    // ← это самое важное
    res.status(500).json({ 
      message: "Ошибка сервера",
      error: err.message   // временно показываем ошибку
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      message: 'Вход успешен',
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });

  } catch (err) {
    console.error("❌ ОШИБКА ПРИ ЛОГИНЕ:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

module.exports = { register, login };