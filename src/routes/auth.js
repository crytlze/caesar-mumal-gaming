const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const { isGuest, isAuth } = require('../middleware/auth');

// Login page
router.get('/login', isGuest, (req, res) => {
  res.render('auth/login', { title: 'Login - Caesar Mumal Gaming' });
});

// Login process
router.post('/login', isGuest, (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user) {
    req.flash('error', 'Username atau password salah');
    return res.redirect('/auth/login');
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    req.flash('error', 'Username atau password salah');
    return res.redirect('/auth/login');
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance
  };

  req.flash('success', `Selamat datang, ${user.username}! 🎮`);
  if (user.role === 'admin') return res.redirect('/admin');
  res.redirect('/seller');
});

// Register page
router.get('/register', isGuest, (req, res) => {
  res.render('auth/register', { title: 'Daftar - Caesar Mumal Gaming' });
});

// Register process
router.post('/register', isGuest, (req, res) => {
  const { username, email, password, confirm_password } = req.body;

  if (password !== confirm_password) {
    req.flash('error', 'Password dan konfirmasi password tidak cocok');
    return res.redirect('/auth/register');
  }

  if (password.length < 6) {
    req.flash('error', 'Password minimal 6 karakter');
    return res.redirect('/auth/register');
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) {
    req.flash('error', 'Username atau email sudah terdaftar');
    return res.redirect('/auth/register');
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hash);

  req.session.user = {
    id: result.lastInsertRowid,
    username,
    email,
    role: 'user',
    balance: 0
  };

  req.flash('success', 'Registrasi berhasil! Selamat datang di Caesar Mumal Gaming 🎉');
  res.redirect('/seller');
});

// Logout
router.get('/logout', isAuth, (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Profile
router.get('/profile', isAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const orders = db.prepare(`
    SELECT o.*, g.name as game_name, g.logo as game_logo, p.name as product_name
    FROM orders o
    JOIN games g ON o.game_id = g.id
    JOIN products p ON o.product_id = p.id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
    LIMIT 20
  `).all(req.session.user.id);

  res.render('auth/profile', { title: 'Profil Saya - Caesar Mumal Gaming', profile: user, orders });
});

module.exports = router;
