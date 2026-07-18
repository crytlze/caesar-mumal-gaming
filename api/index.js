// Vercel entry point - wraps Express app with async DB init
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let app;
let initialized = false;

async function init() {
  if (initialized) return app;
  
  // Initialize sql.js database
  const SQL = await initSqlJs();
  const DB_PATH = '/tmp/ciboy.db';
  let buffer;
  try { buffer = fs.readFileSync(DB_PATH); } catch(e) { buffer = null; }
  const _db = buffer ? new SQL.Database(buffer) : new SQL.Database();
  
  // Create tables
  _db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT, password TEXT, role TEXT DEFAULT 'user', balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  _db.run("CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, logo TEXT, banner TEXT, id_label TEXT DEFAULT 'User ID', id_placeholder TEXT DEFAULT 'Masukkan ID akun game', server_label TEXT, server_placeholder TEXT, has_server INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  _db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, is_promo INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  _db.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL, user_id INTEGER, game_id INTEGER NOT NULL, product_id INTEGER NOT NULL, game_user_id TEXT NOT NULL, game_server TEXT, quantity INTEGER DEFAULT 1, total_price REAL NOT NULL, payment_method TEXT DEFAULT 'saldo', status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  _db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  _db.run("CREATE TABLE IF NOT EXISTS seller_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, game_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, image_url TEXT, contact TEXT, status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  _db.run("CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  
  function saveDb() {
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
  
  // Seed check
  const rowCount = _db.exec("SELECT COUNT(*) as c FROM users");
  if (!rowCount[0] || rowCount[0].values[0][0] === 0) {
    const bcrypt = require('bcryptjs');
    _db.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)", ['admin', 'admin@cmgm.com', bcrypt.hashSync('admin123', 10), 'admin']);
    _db.run("INSERT INTO users (username, email, password, role, balance) VALUES (?, ?, ?, ?, ?)", ['player1', 'player1@gmail.com', bcrypt.hashSync('user123', 10), 'user', 500000]);
    const glist = [['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','Contoh: 12345678','Zone ID','Contoh: 1234',1,1],['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','Contoh: 87654321','','',0,2],['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','Contoh: 51234567','','',0,3],['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','Contoh: Player#1234','','',0,4],['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','Contoh: 801234567','Server','Asia / America',1,5]];
    const gs = _db.prepare("INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)");
    glist.forEach(g => { try { gs.run(g); } catch(e) {} });
    const ip = _db.prepare("INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)");
    ip.run([1, '86 Diamonds', 19500, 22000, 1, 1]);
    ip.run([1, '172 Diamonds', 38500, null, 0, 2]);
    ip.run([2, '140 Diamonds', 18500, null, 0, 1]);
    ip.run([2, '355 Diamonds', 46500, 50000, 1, 2]);
    ip.run([4, '125 VP', 15000, null, 0, 1]);
    ip.run([4, '420 VP', 49000, 50000, 1, 2]);
    saveDb();
  }
  
  // Create a mock db that mirrors better-sqlite3 sync API
  // but backed by sql.js
  const mockDb = {
    _db,
    _saveDb() { saveDb(); },
    prepare(sql) {
      const stmt = _db.prepare(sql);
      return {
        run(...params) { stmt.run(params); saveDb(); stmt.free(); return { changes: 1 }; },
        get(...params) { const r = stmt.getAsObject(params); stmt.free(); return r && Object.keys(r).length ? r : undefined; },
        all(...params) { const results = []; stmt.bind(params); while (stmt.step()) results.push(stmt.getAsObject()); stmt.free(); return results; }
      };
    },
    exec(sql) { _db.run(sql); saveDb(); }
  };
  
  // Store in global so database.js imports can use it
  global.__mockDb = mockDb;
  
  // Now require database module (it will get overwritten later)
  // Actually, let's just require the app with the mock already set
  delete require.cache[require.resolve('../src/models/database')];
  
  app = require('../src/server');
  initialized = true;
  return app;
}

// Vercel serverless handler
module.exports = async (req, res) => {
  try {
    const app = await init();
    return app(req, res);
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).send('Initialization error: ' + err.message);
  }
};
