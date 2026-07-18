const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isVercel = process.env.VERCEL === '1';
let db;

if (isVercel) {
  // Vercel: use in-memory database (read-only filesystem)
  db = new Database(':memory:');
} else {
  // Local: persistent file database
  const dbDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  db = new Database(path.join(dbDir, 'ciboy.db'));
  try { db.pragma('journal_mode = WAL'); } catch(e) {}
  db.pragma('foreign_keys = ON');
}

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, logo TEXT, banner TEXT, id_label TEXT DEFAULT 'User ID', id_placeholder TEXT DEFAULT 'Masukkan ID', server_label TEXT, server_placeholder TEXT, has_server INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, is_promo INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL, user_id INTEGER, game_id INTEGER NOT NULL, product_id INTEGER NOT NULL, game_user_id TEXT NOT NULL, game_server TEXT, quantity INTEGER DEFAULT 1, total_price REAL NOT NULL, payment_method TEXT DEFAULT 'saldo', status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (game_id) REFERENCES games(id), FOREIGN KEY (product_id) REFERENCES products(id));
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS seller_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, game_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, image_url TEXT, contact TEXT, status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (listing_id) REFERENCES seller_listings(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
`);

// Seed data if empty
const cnt = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (cnt === 0) {
  const bcrypt = require('bcryptjs');
  db.prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)").run('admin', 'admin@cmgm.com', bcrypt.hashSync('admin123', 10), 'admin');
  db.prepare("INSERT INTO users (username, email, password, role, balance) VALUES (?, ?, ?, ?, ?)").run('player1', 'player1@gmail.com', bcrypt.hashSync('user123', 10), 'user', 500000);
  const ig = db.prepare('INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
  [['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]].forEach(g => ig.run(...g));
  const ip = db.prepare('INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)');
  ip.run(1,'86 Diamonds',19500,22000,1,1); ip.run(1,'172 Diamonds',38500,null,0,2);
  ip.run(2,'140 Diamonds',18500,null,0,1); ip.run(2,'355 Diamonds',46500,50000,1,2);
  ip.run(4,'125 VP',15000,null,0,1); ip.run(4,'420 VP',49000,50000,1,2);
}

module.exports = db;
