function isAuth(req, res, next) {
  if (req.session.user) return next();
  req.flash('error', 'Silakan login terlebih dahulu');
  res.redirect('/auth/login');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Akses ditolak! Hanya admin yang bisa mengakses halaman ini');
  res.redirect('/');
}

function isGuest(req, res, next) {
  if (!req.session.user) return next();
  res.redirect('/');
}

module.exports = { isAuth, isAdmin, isGuest };
