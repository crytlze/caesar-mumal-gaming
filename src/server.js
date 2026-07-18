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

app.use('/', homeRoutes);
app.use('/auth', authRoutes);
app.use('/order', orderRoutes);
app.use('/admin', adminRoutes);
app.use('/seller', sellerRoutes);
app.use('/payment', paymentRoutes);

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
