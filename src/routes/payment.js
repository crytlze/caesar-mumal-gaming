const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { isAuth } = require('../middleware/auth');

// ========================
// DAFTAR METODE PEMBAYARAN
// ========================
router.get('/methods', (req, res) => {
  const methods = [
    { id: 'saldo', name: 'Saldo Akun', icon: '💰', desc: 'Bayar pakai saldo Ciboy Market', min: 0 },
    { id: 'qris', name: 'QRIS (All Payment)', icon: '📱', desc: 'Scan QR via GoPay, OVO, DANA, ShopeePay, LinkAja, Bank', min: 1000 },
    { id: 'gopay', name: 'GoPay', icon: '💚', desc: 'Pembayaran via GoPay', min: 1000 },
    { id: 'dana', name: 'DANA', icon: '💙', desc: 'Pembayaran via DANA', min: 1000 },
    { id: 'ovo', name: 'OVO', icon: '💜', desc: 'Pembayaran via OVO', min: 1000 },
    { id: 'bca', name: 'BCA Virtual Account', icon: '🏦', desc: 'Transfer ke BCA Virtual Account', min: 5000 },
    { id: 'mandiri', name: 'Mandiri Virtual Account', icon: '🏦', desc: 'Transfer ke Mandiri Virtual Account', min: 5000 },
    { id: 'bri', name: 'BRI Virtual Account', icon: '🏦', desc: 'Transfer ke BRI Virtual Account', min: 5000 },
    { id: 'alfamart', name: 'Alfamart / Indomaret', icon: '🏪', desc: 'Bayar di convenience store terdekat', min: 10000 },
  ];
  res.json({ success: true, methods });
});

// ========================
// TOP UP SALDO
// ========================
router.get('/topup', isAuth, (req, res) => {
  res.render('payment/topup', { title: 'Top Up Saldo - Caesar Mumal Gaming' });
});

router.post('/topup', isAuth, (req, res) => {
  const { amount, method } = req.body;
  const nominal = parseInt(amount);

  if (!nominal || nominal < 10000) {
    req.flash('error', 'Minimal top up Rp 10.000');
    return res.redirect('/payment/topup');
  }

  // Simulasi pembayaran — langsung masukin saldo
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(nominal, req.session.user.id);
  req.session.user.balance = (req.session.user.balance || 0) + nominal;

  req.flash('success', `Top up Rp ${nominal.toLocaleString('id-ID')} berhasil! Saldo: Rp ${parseInt(req.session.user.balance).toLocaleString('id-ID')}`);
  res.redirect('/seller');
});

// ========================
// PEMBAYARAN ORDER
// ========================
router.get('/pay/:orderId', isAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, g.name as game_name, g.logo as game_logo, p.name as product_name
    FROM orders o
    JOIN games g ON o.game_id = g.id
    JOIN products p ON o.product_id = p.id
    WHERE o.order_id = ? AND o.user_id = ?
  `).get(req.params.orderId, req.session.user.id);

  if (!order) {
    req.flash('error', 'Pesanan tidak ditemukan');
    return res.redirect('/');
  }

  res.render('payment/pay', { title: `Bayar ${order.order_id} - Caesar Mumal Gaming`, order });
});

router.post('/pay/:orderId', isAuth, (req, res) => {
  const { method } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE order_id = ? AND user_id = ?').get(req.params.orderId, req.session.user.id);

  if (!order) {
    req.flash('error', 'Pesanan tidak ditemukan');
    return res.redirect('/');
  }

  if (method === 'saldo') {
    const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.session.user.id);
    if (user.balance < order.total_price) {
      req.flash('error', 'Saldo tidak mencukupi. Silakan top up dulu.');
      return res.redirect('/payment/topup');
    }
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(order.total_price, req.session.user.id);
    db.prepare("UPDATE orders SET status = 'processing', payment_method = 'saldo', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(order.id);
    req.session.user.balance = user.balance - order.total_price;
    req.flash('success', 'Pembayaran berhasil! Pesanan sedang diproses.');
    return res.redirect('/order/' + order.order_id);
  }

  // Non-saldo payment simulation
  db.prepare("UPDATE orders SET status = 'processing', payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(method, order.id);
  req.flash('success', `Pembayaran via ${method.toUpperCase()} berhasil dikonfirmasi! Pesanan sedang diproses.`);
  res.redirect('/order/' + order.order_id);
});

module.exports = router;
