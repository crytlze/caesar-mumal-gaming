const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { isAuth } = require('../middleware/auth');

// Generate unique order ID
function generateOrderId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CB${y}${m}${d}${rand}`;
}

// Create order
router.post('/create', isAuth, (req, res) => {
  const { game_id, product_id, game_user_id, game_server, payment_method } = req.body;

  // Validate game
  const game = db.prepare('SELECT * FROM games WHERE id = ? AND is_active = 1').get(game_id);
  if (!game) {
    req.flash('error', 'Game tidak ditemukan');
    return res.redirect('/');
  }

  // Validate product
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND game_id = ? AND is_active = 1').get(product_id, game_id);
  if (!product) {
    req.flash('error', 'Produk tidak ditemukan');
    return res.redirect(`/game/${game.slug}`);
  }

  // Validate game user ID
  if (!game_user_id || game_user_id.trim() === '') {
    req.flash('error', `${game.id_label} wajib diisi`);
    return res.redirect(`/game/${game.slug}`);
  }

  // Check balance if paying with saldo
  if (payment_method === 'saldo') {
    const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.session.user.id);
    if (user.balance < product.price) {
      req.flash('error', 'Saldo tidak mencukupi! Silakan top up saldo Anda');
      return res.redirect(`/game/${game.slug}`);
    }

    // Deduct balance
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(product.price, req.session.user.id);
    req.session.user.balance = user.balance - product.price;
  }

  const orderId = generateOrderId();

  db.prepare(`
    INSERT INTO orders (order_id, user_id, game_id, product_id, game_user_id, game_server, total_price, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId,
    req.session.user.id,
    game_id,
    product_id,
    game_user_id.trim(),
    game_server || null,
    product.price,
    payment_method || 'saldo',
    payment_method === 'saldo' ? 'processing' : 'pending'
  );

  req.flash('success', `Order berhasil dibuat! ID Pesanan: ${orderId}`);
  res.redirect(`/order/${orderId}`);
});

// Order detail
router.get('/:orderId', isAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, g.name as game_name, g.logo as game_logo, g.slug as game_slug, p.name as product_name
    FROM orders o
    JOIN games g ON o.game_id = g.id
    JOIN products p ON o.product_id = p.id
    WHERE o.order_id = ? AND o.user_id = ?
  `).get(req.params.orderId, req.session.user.id);

  if (!order) {
    req.flash('error', 'Order tidak ditemukan');
    return res.redirect('/auth/profile');
  }

  res.render('order-detail', { title: `Order ${order.order_id} - Caesar Mumal Gaming`, order });
});

// Check order (no login required)
router.get('/check/:orderId', (req, res) => {
  const order = db.prepare(`
    SELECT o.order_id, o.status, o.total_price, o.game_user_id, o.created_at, o.payment_method,
           g.name as game_name, g.logo as game_logo, p.name as product_name
    FROM orders o
    JOIN games g ON o.game_id = g.id
    JOIN products p ON o.product_id = p.id
    WHERE o.order_id = ?
  `).get(req.params.orderId);

  if (!order) {
    return res.json({ success: false, message: 'Order tidak ditemukan' });
  }

  res.json({ success: true, order });
});

module.exports = router;
