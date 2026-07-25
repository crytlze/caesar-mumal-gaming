const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// VIEW ENGINE
// ========================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// ========================
// MIDDLEWARE
// ========================
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'cmgm-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

app.use(flash());

// Global variables for views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// ========================
// ROUTES
// ========================
const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/order');
const adminRoutes = require('./routes/admin');
const sellerRoutes = require('./routes/seller');
const paymentRoutes = require('./routes/payment');
const sitemapRoutes = require('./routes/sitemap');
const wishlistRoutes = require('./routes/wishlist');
const forgotRoutes = require('./routes/forgot');
const { router: notifRoutes } = require('./routes/notif');

app.use('/', homeRoutes);
app.use('/auth', [authRoutes, forgotRoutes]);
app.use('/order', orderRoutes);
app.use('/admin', adminRoutes);
app.use('/seller', sellerRoutes);
app.use('/payment', paymentRoutes);
app.use('/sitemap', sitemapRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/notifications', notifRoutes);

// Sitemap and robots at root level
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://caesar-mumal-gaming-production.up.railway.app';
  const games = require('./models/database').prepare('SELECT slug, created_at FROM games WHERE is_active = 1').all();
  const listings = require('./models/database').prepare("SELECT id, created_at FROM seller_listings WHERE status = 'approved'").all();
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const pages = [
    { loc: '', priority: '1.0', changefreq: 'daily' },
    { loc: '/joki', priority: '0.8', changefreq: 'weekly' },
    { loc: '/akun-game', priority: '0.8', changefreq: 'weekly' },
    { loc: '/seller/marketplace', priority: '0.9', changefreq: 'hourly' },
  ];
  pages.forEach(p => { xml += `<url><loc>${baseUrl}${p.loc}</loc><priority>${p.priority}</priority><changefreq>${p.changefreq}</changefreq></url>`; });
  games.forEach(g => { const d = new Date(g.created_at || Date.now()).toISOString(); xml += `<url><loc>${baseUrl}/game/${g.slug}</loc><priority>0.9</priority><changefreq>daily</changefreq><lastmod>${d}</lastmod></url>`; });
  listings.forEach(l => { const d = new Date(l.created_at || Date.now()).toISOString(); xml += `<url><loc>${baseUrl}/seller/listing/${l.id}</loc><priority>0.7</priority><changefreq>weekly</changefreq><lastmod>${d}</lastmod></url>`; });
  xml += '</urlset>';
  res.header('Content-Type', 'application/xml').send(xml);
});
app.get('/robots.txt', (req, res) => {
  res.header('Content-Type', 'text/plain').send(`User-agent: *\nAllow: /\nSitemap: https://caesar-mumal-gaming-production.up.railway.app/sitemap.xml\n`);
});

// Notif count middleware for navbar
app.use((req, res, next) => {
  if (req.session.user) {
    try {
      const db = require('./models/database');
      res.locals.unreadNotif = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.session.user.id).c;
    } catch(e) { res.locals.unreadNotif = 0; }
  } else {
    res.locals.unreadNotif = 0;
  }
  res.locals.wishlistCount = 0;
  if (req.session.user) {
    try {
      const db = require('./models/database');
      res.locals.wishlistCount = db.prepare('SELECT COUNT(*) as c FROM wishlist WHERE user_id = ?').get(req.session.user.id).c;
    } catch(e) { res.locals.wishlistCount = 0; }
  }
  next();
});

// Add notif creation to req for routes
const { createNotification } = require('./routes/notif');
app.use((req, res, next) => {
  req.createNotification = createNotification;
  next();
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Error', message: err.message });
});

// ========================
// START SERVER (only locally, not on Vercel)
// ========================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════╗
  ║                                      ║
  ║   🎮  CAESAR MUMAL GAMING MARKET     ║
  ║                                      ║
  ║   Server running on port ${PORT}        ║
  ║   http://localhost:${PORT}              ║
  ║                                      ║
  ╚══════════════════════════════════════╝
    `);
  });
}

module.exports = app;
