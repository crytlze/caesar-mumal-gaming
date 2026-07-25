const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../models/database');
const { isGuest, isAuth } = require('../middleware/auth');
router.get('/forgot', isGuest, (req, res) => {
  res.render('auth/forgot', { title: 'Lupa Password - Caesar Mumal Gaming', step: 'email' });
});

router.post('/forgot', isGuest, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT id, username FROM users WHERE email = ?').get(email);
  
  if (!user) {
    req.flash('error', 'Email tidak ditemukan dalam sistem');
    return res.redirect('/auth/forgot');
  }
  
  // Generate token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);
  
  const resetLink = `${req.protocol}://${req.get('host')}/auth/reset/${token}`;
  
  // In production, send email. For now, show the link directly (simulasi)
  req.flash('success', `Link reset password telah dikirim ke ${email}. (Simulasi: ${resetLink})`);
  res.redirect('/auth/login');
});

// ========================
// RESET PASSWORD
// ========================
router.get('/reset/:token', isGuest, (req, res) => {
  const reset = db.prepare(`
    SELECT pr.*, u.username FROM password_resets pr
    JOIN users u ON pr.user_id = u.id
    WHERE pr.token = ? AND pr.used = 0 AND pr.expires_at > datetime('now')
  `).get(req.params.token);
  
  if (!reset) {
    req.flash('error', 'Link reset tidak valid atau sudah kadaluarsa');
    return res.redirect('/auth/login');
  }
  
  res.render('auth/forgot', { title: 'Reset Password - Caesar Mumal Gaming', step: 'reset', token: req.params.token });
});

router.post('/reset/:token', isGuest, (req, res) => {
  const { password, confirm_password } = req.body;
  
  if (password !== confirm_password) {
    req.flash('error', 'Password dan konfirmasi tidak cocok');
    return res.redirect('/auth/reset/' + req.params.token);
  }
  
  if (password.length < 6) {
    req.flash('error', 'Password minimal 6 karakter');
    return res.redirect('/auth/reset/' + req.params.token);
  }
  
  const reset = db.prepare(`
    SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(req.params.token);
  
  if (!reset) {
    req.flash('error', 'Link reset tidak valid atau sudah kadaluarsa');
    return res.redirect('/auth/login');
  }
  
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  
  req.flash('success', 'Password berhasil direset! Silakan login dengan password baru.');
  res.redirect('/auth/login');
});

// ========================
// CHANGE PASSWORD (from profile)
// ========================
router.post('/change-password', isAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.session.user.id);
  
  if (!bcrypt.compareSync(current_password, user.password)) {
    req.flash('error', 'Password saat ini salah');
    return res.redirect('/auth/profile');
  }
  
  if (new_password !== confirm_password) {
    req.flash('error', 'Password baru dan konfirmasi tidak cocok');
    return res.redirect('/auth/profile');
  }
  
  if (new_password.length < 6) {
    req.flash('error', 'Password baru minimal 6 karakter');
    return res.redirect('/auth/profile');
  }
  
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.session.user.id);
  
  req.flash('success', 'Password berhasil diubah! 🔒');
  res.redirect('/auth/profile');
});

module.exports = router;
