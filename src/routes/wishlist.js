const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { isAuth } = require('../middleware/auth');

// Add to wishlist
router.post('/add/:listingId', isAuth, (req, res) => {
  const listing = db.prepare("SELECT id FROM seller_listings WHERE id = ? AND status = 'approved'").get(req.params.listingId);
  if (!listing) {
    return res.json({ success: false, message: 'Listing tidak ditemukan' });
  }
  
  const existing = db.prepare('SELECT id FROM wishlist WHERE user_id = ? AND listing_id = ?').get(req.session.user.id, req.params.listingId);
  if (existing) {
    return res.json({ success: false, message: 'Sudah ada di wishlist', alreadyInWishlist: true });
  }
  
  try {
    db.prepare('INSERT INTO wishlist (user_id, listing_id) VALUES (?, ?)').run(req.session.user.id, req.params.listingId);
    res.json({ success: true, message: 'Ditambahkan ke wishlist ❤️' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Remove from wishlist
router.post('/remove/:listingId', isAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM wishlist WHERE user_id = ? AND listing_id = ?').run(req.session.user.id, req.params.listingId);
    res.json({ success: true, message: 'Dihapus dari wishlist' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// View my wishlist
router.get('/', isAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;
  
  const total = db.prepare('SELECT COUNT(*) as c FROM wishlist WHERE user_id = ?').get(req.session.user.id).c;
  const totalPages = Math.ceil(total / limit);
  
  const items = db.prepare(`
    SELECT w.*, sl.title, sl.price, sl.category, sl.game_name, sl.status as listing_status,
           sl.featured, sl.views, sl.created_at as listing_created, u.username
    FROM wishlist w
    JOIN seller_listings sl ON w.listing_id = sl.id
    JOIN users u ON sl.user_id = u.id
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.session.user.id, limit, offset);
  
  res.render('wishlist', {
    title: 'Wishlist Saya - Caesar Mumal Gaming',
    items,
    pagination: { page, totalPages, total, limit }
  });
});

module.exports = router;
