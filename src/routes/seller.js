const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../models/database');
const { isAuth } = require('../middleware/auth');
const { createNotification } = require('./notif');

const isVercel = !!process.env.VERCEL;

// ========================
// FILE UPLOAD CONFIG (skip on Vercel)
// ========================
let upload = null;

if (!isVercel) {
  const multer = require('multer');
  const storage = multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'public', 'uploads', 'listings'),
    filename: function (req, file, cb) {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, 'listing-' + unique + ext);
    }
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|gif|webp/;
      const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
      const mimeOk = allowed.test(file.mimetype.split('/')[1]);
      if (extOk && mimeOk) return cb(null, true);
      cb(new Error('Hanya file gambar (JPG, PNG, GIF, WEBP) yang diizinkan.'));
    }
  });
}

// ========================
// SELLER DASHBOARD
// ========================
router.get('/', isAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ?').all(req.session.user.id);
  const totalCount = total.length > 0 && total[0] ? total[0].c : (db.prepare('SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ?').get(req.session.user.id)?.c || 0);
  const totalPages = Math.ceil(totalCount / limit);
  
  const listings = db.prepare(`SELECT * FROM seller_listings WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(req.session.user.id, limit, offset);
  
  // Get average rating for each listing
  const ratings = db.prepare(`
    SELECT listing_id, ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as total_reviews
    FROM reviews WHERE listing_id IN (SELECT id FROM seller_listings WHERE user_id = ?)
    GROUP BY listing_id
  `).all(req.session.user.id);
  const ratingMap = {};
  ratings.forEach(r => { ratingMap[r.listing_id] = r; });

  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ?').get(req.session.user.id).c,
    active: db.prepare("SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ? AND status = 'approved'").get(req.session.user.id).c,
    pending: db.prepare("SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ? AND status = 'pending'").get(req.session.user.id).c,
    sold: db.prepare("SELECT COUNT(*) as c FROM seller_listings WHERE user_id = ? AND status = 'sold'").get(req.session.user.id).c
  };

  res.render('seller/dashboard', { title: 'Seller Dashboard - Caesar Mumal Gaming', listings, stats, ratingMap, pagination: { page, totalPages, total: totalCount, limit } });
});

// ========================
// CREATE LISTING
// ========================
router.get('/create', isAuth, (req, res) => {
  const games = db.prepare('SELECT id, name, logo FROM games WHERE is_active = 1 ORDER BY name ASC').all();
  res.render('seller/create', { title: 'Buat Listing Baru - Caesar Mumal Gaming', games });
});

router.post('/create', isAuth, (req, res) => {
  const { category, game_name, title, description, price, original_price, contact } = req.body;

  if (!category || !game_name || !title || !price) {
    req.flash('error', 'Mohon isi semua field yang wajib (*)');
    return res.redirect('/seller/create');
  }

  let imageUrl = req.body.image_url || '';
  if (!isVercel && req.file) {
    imageUrl = '/uploads/listings/' + req.file.filename;
  } else if (isVercel && req.body.image_url) {
    imageUrl = req.body.image_url;
  }

  try {
    db.prepare(`
      INSERT INTO seller_listings (user_id, category, game_name, title, description, price, original_price, image_url, contact, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      req.session.user.id, category, game_name.trim(), title.trim(),
      description || '', parseFloat(price) || 0,
      original_price ? parseFloat(original_price) : null,
      imageUrl, contact || req.session.user.username
    );
    
    // Notify admins
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
    admins.forEach(a => {
      createNotification(a.id, 'listing_baru', 'Listing Baru Menunggu Verifikasi', `${req.session.user.username} membuat listing: ${title}`, '/admin/listings');
    });
    
    req.flash('success', 'Listing berhasil dibuat! Menunggu verifikasi admin.');
  } catch (err) {
    req.flash('error', 'Gagal membuat listing: ' + err.message);
  }
  res.redirect('/seller');
});

// ========================
// EDIT LISTING
// ========================
router.get('/edit/:id', isAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM seller_listings WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
  if (!listing) { req.flash('error', 'Listing tidak ditemukan'); return res.redirect('/seller'); }
  const games = db.prepare('SELECT id, name, logo FROM games WHERE is_active = 1 ORDER BY name ASC').all();
  res.render('seller/edit', { title: 'Edit Listing - Caesar Mumal Gaming', listing, games });
});

router.post('/edit/:id', isAuth, upload ? upload.single('image') : (req, res, next) => next(), (req, res) => {
  const { category, game_name, title, description, price, original_price, contact } = req.body;

  let imageUrl = req.body.image_url || '';
  if (!isVercel && req.file) imageUrl = '/uploads/listings/' + req.file.filename;
  else if (isVercel && req.body.image_url) imageUrl = req.body.image_url;

  try {
    db.prepare(`
      UPDATE seller_listings SET category=?, game_name=?, title=?, description=?, price=?, original_price=?, image_url=?, contact=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?
    `).run(
      category, game_name, title, description || '', parseFloat(price) || 0,
      original_price ? parseFloat(original_price) : null,
      imageUrl || '', contact || '', req.params.id, req.session.user.id
    );
    req.flash('success', 'Listing berhasil diupdate!');
  } catch (err) { req.flash('error', 'Gagal update: ' + err.message); }
  res.redirect('/seller');
});

// ========================
// DELETE LISTING
// ========================
router.post('/delete/:id', isAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM seller_listings WHERE id = ? AND user_id = ?').run(req.params.id, req.session.user.id);
    req.flash('success', 'Listing berhasil dihapus');
  } catch (err) { req.flash('error', 'Gagal hapus: ' + err.message); }
  res.redirect('/seller');
});

// ========================
// REVIEW ROUTES
// ========================
router.post('/review/:listingId', isAuth, (req, res) => {
  const { rating, comment } = req.body;
  const listing = db.prepare('SELECT id, user_id, title FROM seller_listings WHERE id = ? AND status = ?').get(req.params.listingId, 'approved');
  if (!listing) { req.flash('error', 'Listing tidak ditemukan'); return res.redirect('/seller/marketplace'); }
  if (listing.user_id === req.session.user.id) { req.flash('error', 'Kamu tidak bisa mereview listingmu sendiri'); return res.redirect('/seller/listing/' + req.params.listingId); }

  const existing = db.prepare('SELECT id FROM reviews WHERE listing_id = ? AND user_id = ?').get(req.params.listingId, req.session.user.id);
  if (existing) { req.flash('error', 'Kamu sudah memberikan review untuk listing ini'); return res.redirect('/seller/listing/' + req.params.listingId); }

  db.prepare('INSERT INTO reviews (listing_id, user_id, rating, comment) VALUES (?, ?, ?, ?)').run(req.params.listingId, req.session.user.id, parseInt(rating) || 5, comment || '');
  
  // Notify seller
  createNotification(listing.user_id, 'review_baru', 'Review Baru!', `${req.session.user.username} memberi rating ${rating}⭐ pada listing "${listing.title}"`, '/seller/listing/' + req.params.listingId);
  
  req.flash('success', 'Review berhasil dikirim! ⭐');
  res.redirect('/seller/listing/' + req.params.listingId);
});

// ========================
// PUBLIC: MARKETPLACE (with Pagination)
// ========================
router.get('/marketplace', (req, res) => {
  const category = req.query.category || '';
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;
  
  let countQuery = "SELECT COUNT(*) as c FROM seller_listings sl JOIN users u ON sl.user_id = u.id WHERE sl.status = 'approved'";
  let query = "SELECT sl.*, u.username FROM seller_listings sl JOIN users u ON sl.user_id = u.id WHERE sl.status = 'approved'";
  const countParams = [];
  const params = [];

  if (category) { query += ' AND sl.category = ?'; countQuery += ' AND sl.category = ?'; params.push(category); countParams.push(category); }
  if (search) { query += ' AND (sl.title LIKE ? OR sl.game_name LIKE ? OR sl.description LIKE ?)'; countQuery += ' AND (sl.title LIKE ? OR sl.game_name LIKE ? OR sl.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); countParams.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY sl.featured DESC, sl.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const total = (db.prepare(countQuery).get(...countParams) || { c: 0 }).c;
  const totalPages = Math.ceil(total / limit);
  
  const listings = db.prepare(query).all(...params);
  
  // Check wishlist for logged in user
  let wishlistIds = [];
  if (req.session.user) {
    const wl = db.prepare('SELECT listing_id FROM wishlist WHERE user_id = ?').all(req.session.user.id);
    wishlistIds = wl.map(w => w.listing_id);
  }
  
  res.render('marketplace', {
    title: 'Marketplace Member - Caesar Mumal Gaming',
    listings,
    selectedCategory: category,
    searchQuery: search,
    pagination: { page, totalPages, total, limit },
    wishlistIds
  });
});

// ========================
// PUBLIC: LISTING DETAIL + REVIEWS
// ========================
router.get('/listing/:id', (req, res) => {
  const listing = db.prepare(`SELECT sl.*, u.username FROM seller_listings sl JOIN users u ON sl.user_id = u.id WHERE sl.id = ? AND sl.status = 'approved'`).get(req.params.id);
  if (!listing) return res.status(404).render('404', { title: 'Listing Tidak Ditemukan' });

  db.prepare('UPDATE seller_listings SET views = views + 1 WHERE id = ?').run(req.params.id);

  const reviews = db.prepare(`
    SELECT r.*, u.username FROM reviews r
    JOIN users u ON r.user_id = u.id
    WHERE r.listing_id = ? ORDER BY r.created_at DESC
  `).all(req.params.id);

  const ratingStats = db.prepare(`
    SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as total_reviews
    FROM reviews WHERE listing_id = ?
  `).get(req.params.id);

  const userReview = req.session.user ? db.prepare('SELECT id FROM reviews WHERE listing_id = ? AND user_id = ?').get(req.params.id, req.session.user.id) : null;
  
  const isInWishlist = req.session.user ? !!db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND listing_id = ?').get(req.session.user.id, req.params.id) : false;

  res.render('listing-detail', {
    title: `${listing.title} - Caesar Mumal Gaming`,
    listing, reviews, ratingStats, userReview, isInWishlist
  });
});

// Wishlist toggle from listing detail
router.post('/wishlist/toggle/:id', isAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND listing_id = ?').get(req.session.user.id, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM wishlist WHERE id = ?').run(existing.id);
    res.json({ success: true, inWishlist: false, message: 'Dihapus dari wishlist' });
  } else {
    db.prepare('INSERT INTO wishlist (user_id, listing_id) VALUES (?, ?)').run(req.session.user.id, req.params.id);
    res.json({ success: true, inWishlist: true, message: 'Ditambahkan ke wishlist ❤️' });
  }
});

module.exports = router;
