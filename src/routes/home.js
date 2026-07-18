const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Homepage
router.get('/', (req, res) => {
  const games = db.prepare('SELECT * FROM games WHERE is_active = 1 ORDER BY sort_order ASC, name ASC').all();
  const promoProducts = db.prepare(`
    SELECT p.*, g.name as game_name, g.slug as game_slug, g.logo as game_logo
    FROM products p
    JOIN games g ON p.game_id = g.id
    WHERE p.is_promo = 1 AND p.is_active = 1 AND g.is_active = 1
    ORDER BY p.sort_order ASC
    LIMIT 8
  `).all();

  // Member listings (marketplace)
  const memberListings = db.prepare(`
    SELECT sl.*, u.username FROM seller_listings sl
    JOIN users u ON sl.user_id = u.id
    WHERE sl.status = 'approved'
    ORDER BY sl.featured DESC, sl.created_at DESC
    LIMIT 6
  `).all();

  res.render('index', {
    title: 'Caesar Mumal Gaming Market Place - Top Up Game Termurah & Tercepat',
    games,
    promoProducts,
    memberListings
  });
});

// Game detail page
router.get('/game/:slug', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!game) return res.status(404).render('404', { title: '404 - Game Tidak Ditemukan' });

  const products = db.prepare('SELECT * FROM products WHERE game_id = ? AND is_active = 1 ORDER BY sort_order ASC, price ASC').all(game.id);

  res.render('game', { title: `Top Up ${game.name} - Caesar Mumal Gaming`, game, products });
});

// Joki page
router.get('/joki', (req, res) => {
  res.render('joki', { title: 'Jasa Joki Game - Caesar Mumal Gaming' });
});

// Akun Game page
router.get('/akun-game', (req, res) => {
  res.render('akun-game', { title: 'Jual Beli Akun Game - Caesar Mumal Gaming' });
});

// Search
router.get('/search', (req, res) => {
  const q = req.query.q || '';
  const games = db.prepare('SELECT * FROM games WHERE is_active = 1 AND name LIKE ? ORDER BY name ASC').all(`%${q}%`);
  res.render('search', { title: `Cari "${q}" - Caesar Mumal Gaming`, games, query: q });
});

module.exports = router;
