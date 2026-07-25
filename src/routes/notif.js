const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { isAuth } = require('../middleware/auth');

// Helper: create notification
function createNotification(userId, type, title, message, link) {
  try {
    db.prepare('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)')
      .run(userId, type, title, message || '', link || '');
  } catch (e) {
    console.error('Notif error:', e.message);
  }
}

// Get unread count (for navbar badge)
router.get('/unread-count', isAuth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.session.user.id).c;
  res.json({ success: true, count });
});

// List notifications
router.get('/', isAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  const total = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ?')
    .get(req.session.user.id).c;
  const totalPages = Math.ceil(total / limit);
  
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(req.session.user.id, limit, offset);
  
  res.render('notifications', {
    title: 'Notifikasi - Caesar Mumal Gaming',
    notifications,
    pagination: { page, totalPages, total, limit }
  });
});

// Mark one as read
router.post('/read/:id', isAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.user.id);
  res.json({ success: true });
});

// Mark all as read
router.post('/read-all', isAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(req.session.user.id);
  req.flash('success', 'Semua notifikasi dibaca');
  res.redirect('/notifications');
});

module.exports = { router, createNotification };
