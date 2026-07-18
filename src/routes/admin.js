const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { isAdmin } = require('../middleware/auth');

// Admin dashboard
router.get('/', isAdmin, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalGames = db.prepare('SELECT COUNT(*) as count FROM games').get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE status IN (?, ?)').get('success', 'processing').total;
  const recentOrders = db.prepare(`
    SELECT o.*, g.name as game_name, p.name as product_name, u.username
    FROM orders o
    JOIN games g ON o.game_id = g.id
    JOIN products p ON o.product_id = p.id
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC LIMIT 10
  `).all();
  const pendingOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get('pending').count;

  res.render('admin/dashboard', {
    title: 'Dashboard Admin - Caesar Mumal Gaming',
    stats: { totalUsers, totalGames, totalOrders, totalRevenue, pendingOrders },
    recentOrders
  });
});

// ========================
// GAMES MANAGEMENT
// ========================
router.get('/games', isAdmin, (req, res) => {
  const games = db.prepare('SELECT g.*, (SELECT COUNT(*) FROM products WHERE game_id = g.id) as product_count FROM games g ORDER BY g.sort_order ASC, g.name ASC').all();
  res.render('admin/games', { title: 'Kelola Game - Caesar Mumal Gaming', games });
});

router.get('/games/add', isAdmin, (req, res) => {
  res.render('admin/game-form', { title: 'Tambah Game - Caesar Mumal Gaming', game: null });
});

router.post('/games/add', isAdmin, (req, res) => {
  const { name, slug, description, logo, id_label, id_placeholder, server_label, server_placeholder, has_server, sort_order } = req.body;
  const gameSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  try {
    db.prepare(`
      INSERT INTO games (name, slug, description, logo, id_label, id_placeholder, server_label, server_placeholder, has_server, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, gameSlug, description || '', logo || '', id_label || 'User ID', id_placeholder || 'Masukkan ID', server_label || '', server_placeholder || '', has_server ? 1 : 0, sort_order || 0);

    req.flash('success', `Game "${name}" berhasil ditambahkan!`);
  } catch (err) {
    req.flash('error', 'Gagal menambahkan game: ' + err.message);
  }
  res.redirect('/admin/games');
});

router.get('/games/edit/:id', isAdmin, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) {
    req.flash('error', 'Game tidak ditemukan');
    return res.redirect('/admin/games');
  }
  res.render('admin/game-form', { title: `Edit ${game.name} - Caesar Mumal Gaming`, game });
});

router.post('/games/edit/:id', isAdmin, (req, res) => {
  const { name, slug, description, logo, id_label, id_placeholder, server_label, server_placeholder, has_server, is_active, sort_order } = req.body;

  try {
    db.prepare(`
      UPDATE games SET name=?, slug=?, description=?, logo=?, id_label=?, id_placeholder=?, server_label=?, server_placeholder=?, has_server=?, is_active=?, sort_order=?
      WHERE id=?
    `).run(name, slug, description || '', logo || '', id_label || 'User ID', id_placeholder || 'Masukkan ID', server_label || '', server_placeholder || '', has_server ? 1 : 0, is_active ? 1 : 0, sort_order || 0, req.params.id);

    req.flash('success', `Game "${name}" berhasil diupdate!`);
  } catch (err) {
    req.flash('error', 'Gagal update game: ' + err.message);
  }
  res.redirect('/admin/games');
});

router.post('/games/delete/:id', isAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
    req.flash('success', 'Game berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Gagal menghapus game: ' + err.message);
  }
  res.redirect('/admin/games');
});

// ========================
// PRODUCTS MANAGEMENT
// ========================
router.get('/products', isAdmin, (req, res) => {
  const gameId = req.query.game_id;
  let products, games;

  games = db.prepare('SELECT id, name FROM games ORDER BY name ASC').all();

  if (gameId) {
    products = db.prepare(`
      SELECT p.*, g.name as game_name FROM products p
      JOIN games g ON p.game_id = g.id
      WHERE p.game_id = ? ORDER BY p.sort_order ASC, p.price ASC
    `).all(gameId);
  } else {
    products = db.prepare(`
      SELECT p.*, g.name as game_name FROM products p
      JOIN games g ON p.game_id = g.id
      ORDER BY g.name ASC, p.sort_order ASC, p.price ASC
    `).all();
  }

  res.render('admin/products', { title: 'Kelola Produk - Caesar Mumal Gaming', products, games, selectedGame: gameId });
});

router.post('/products/add', isAdmin, (req, res) => {
  const { game_id, name, description, price, original_price, is_promo, sort_order } = req.body;

  try {
    db.prepare(`
      INSERT INTO products (game_id, name, description, price, original_price, is_promo, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(game_id, name, description || '', parseFloat(price), original_price ? parseFloat(original_price) : null, is_promo ? 1 : 0, sort_order || 0);

    req.flash('success', `Produk "${name}" berhasil ditambahkan!`);
  } catch (err) {
    req.flash('error', 'Gagal menambahkan produk: ' + err.message);
  }
  res.redirect('/admin/products?game_id=' + game_id);
});

router.post('/products/edit/:id', isAdmin, (req, res) => {
  const { game_id, name, description, price, original_price, is_promo, is_active, sort_order } = req.body;

  try {
    db.prepare(`
      UPDATE products SET game_id=?, name=?, description=?, price=?, original_price=?, is_promo=?, is_active=?, sort_order=?
      WHERE id=?
    `).run(game_id, name, description || '', parseFloat(price), original_price ? parseFloat(original_price) : null, is_promo ? 1 : 0, is_active ? 1 : 0, sort_order || 0, req.params.id);

    req.flash('success', `Produk "${name}" berhasil diupdate!`);
  } catch (err) {
    req.flash('error', 'Gagal update produk: ' + err.message);
  }
  res.redirect('/admin/products?game_id=' + game_id);
});

router.post('/products/delete/:id', isAdmin, (req, res) => {
  const product = db.prepare('SELECT game_id FROM products WHERE id = ?').get(req.params.id);
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    req.flash('success', 'Produk berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Gagal menghapus produk: ' + err.message);
  }
  res.redirect('/admin/products' + (product ? '?game_id=' + product.game_id : ''));
});

// ========================
// ORDERS MANAGEMENT
// ========================
router.get('/orders', isAdmin, (req, res) => {
  const status = req.query.status;
  let orders;

  if (status) {
    orders = db.prepare(`
      SELECT o.*, g.name as game_name, p.name as product_name, u.username
      FROM orders o
      JOIN games g ON o.game_id = g.id
      JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
    `).all(status);
  } else {
    orders = db.prepare(`
      SELECT o.*, g.name as game_name, p.name as product_name, u.username
      FROM orders o
      JOIN games g ON o.game_id = g.id
      JOIN products p ON o.product_id = p.id
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `).all();
  }

  res.render('admin/orders', { title: 'Kelola Order - Caesar Mumal Gaming', orders, selectedStatus: status });
});

router.post('/orders/update/:id', isAdmin, (req, res) => {
  const { status, notes } = req.body;

  try {
    db.prepare('UPDATE orders SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, notes || '', req.params.id);

    // Refund if cancelled/failed and paid with saldo
    if (status === 'cancelled' || status === 'failed') {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (order && order.payment_method === 'saldo' && order.user_id) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(order.total_price, order.user_id);
      }
    }

    req.flash('success', 'Status order berhasil diupdate!');
  } catch (err) {
    req.flash('error', 'Gagal update order: ' + err.message);
  }
  res.redirect('/admin/orders');
});

// ========================
// USERS MANAGEMENT
// ========================
router.get('/users', isAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as order_count
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.render('admin/users', { title: 'Kelola User - Caesar Mumal Gaming', users });
});

router.post('/users/topup/:id', isAdmin, (req, res) => {
  const { amount } = req.body;
  try {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(parseFloat(amount), req.params.id);
    req.flash('success', `Saldo berhasil ditambahkan Rp ${parseInt(amount).toLocaleString('id-ID')}!`);
  } catch (err) {
    req.flash('error', 'Gagal menambahkan saldo: ' + err.message);
  }
  res.redirect('/admin/users');
});

// ========================
// LISTINGS MANAGEMENT (member marketplace)
// ========================
router.get('/listings', isAdmin, (req, res) => {
  const status = req.query.status || '';
  let query = `
    SELECT sl.*, u.username FROM seller_listings sl
    JOIN users u ON sl.user_id = u.id
  `;
  const params = [];
  if (status) {
    query += ' WHERE sl.status = ?';
    params.push(status);
  }
  query += ' ORDER BY sl.created_at DESC LIMIT 100';

  const listings = db.prepare(query).all(...params);
  res.render('admin/listings', { title: 'Kelola Listing Member - Caesar Mumal Gaming', listings, selectedStatus: status });
});

router.post('/listings/update/:id', isAdmin, (req, res) => {
  const { status } = req.body;
  try {
    db.prepare('UPDATE seller_listings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    req.flash('success', 'Status listing berhasil diupdate!');
  } catch (err) {
    req.flash('error', 'Gagal update: ' + err.message);
  }
  res.redirect('/admin/listings');
});

router.post('/listings/feature/:id', isAdmin, (req, res) => {
  const listing = db.prepare('SELECT featured FROM seller_listings WHERE id = ?').get(req.params.id);
  if (listing) {
    db.prepare('UPDATE seller_listings SET featured = ? WHERE id = ?').run(listing.featured ? 0 : 1, req.params.id);
    req.flash('success', listing.featured ? 'Featured dihapus!' : 'Listing dijadikan featured!');
  }
  res.redirect('/admin/listings');
});

module.exports = router;
