const path = require('path');
const fs = require('fs');
const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'ciboy.db');

let db;

function saveDb() {
  try { fs.writeFileSync(dbPath, Buffer.from(db.export())); } catch(e) {}
}

function initTables(d) {
  d.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, logo TEXT, banner TEXT, id_label TEXT DEFAULT 'User ID', id_placeholder TEXT DEFAULT 'Masukkan ID', server_label TEXT, server_placeholder TEXT, has_server INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, is_promo INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL, user_id INTEGER, game_id INTEGER NOT NULL, product_id INTEGER NOT NULL, game_user_id TEXT NOT NULL, game_server TEXT, quantity INTEGER DEFAULT 1, total_price REAL NOT NULL, payment_method TEXT DEFAULT 'saldo', status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  d.run("CREATE TABLE IF NOT EXISTS seller_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, game_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, image_url TEXT, contact TEXT, status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
}

function seedData(d) {
  const bcrypt = require('bcryptjs');
  d.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)", ['admin', 'admin@cmgm.com', bcrypt.hashSync('admin123', 10), 'admin']);
  d.run("INSERT INTO users (username, email, password, role, balance) VALUES (?, ?, ?, ?, ?)", ['player1', 'player1@gmail.com', bcrypt.hashSync('user123', 10), 'user', 500000]);
  const glist = [['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]];
  const gs = d.prepare("INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)");
  glist.forEach(g => { try { gs.run(g); } catch(e) {} });
  const ip = d.prepare("INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)");
  try { ip.run(1,'86 Diamonds',19500,22000,1,1); } catch(e) {}
  try { ip.run(1,'172 Diamonds',38500,null,0,2); } catch(e) {}
  try { ip.run(2,'140 Diamonds',18500,null,0,1); } catch(e) {}
  try { ip.run(2,'355 Diamonds',46500,50000,1,2); } catch(e) {}
  try { ip.run(4,'125 VP',15000,null,0,1); } catch(e) {}
  try { ip.run(4,'420 VP',49000,50000,1,2); } catch(e) {}
}

function createSyncWrapper(d) {
  return {
    prepare(sql) {
      const stmt = d.prepare(sql);
      return {
        run(...params) {
          try { const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.run(args); saveDb(); } finally { stmt.free(); }
          return { changes: d.getRowsModified() };
        },
        get(...params) {
          try { const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.bind(args); if (stmt.step()) return stmt.getAsObject(); return undefined; } finally { stmt.free(); }
        },
        all(...params) {
          const results = []; try { const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.bind(args); while (stmt.step()) results.push(stmt.getAsObject()); return results; } finally { stmt.free(); }
        }
      };
    },
    exec(sql) { d.run(sql); saveDb(); },
    pragma() {}
  };
}

// Load better-sqlite3 first, fallback to sql.js
let usingSqlJs = false;
try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  try { db.pragma('journal_mode = WAL'); } catch(e) {}
  db.pragma('foreign_keys = ON');
  db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, logo TEXT, banner TEXT, id_label TEXT DEFAULT 'User ID', id_placeholder TEXT DEFAULT 'Masukkan ID', server_label TEXT, server_placeholder TEXT, has_server INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, is_promo INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL, user_id INTEGER, game_id INTEGER NOT NULL, product_id INTEGER NOT NULL, game_user_id TEXT NOT NULL, game_server TEXT, quantity INTEGER DEFAULT 1, total_price REAL NOT NULL, payment_method TEXT DEFAULT 'saldo', status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (game_id) REFERENCES games(id), FOREIGN KEY (product_id) REFERENCES products(id));CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);CREATE TABLE IF NOT EXISTS seller_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, game_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, image_url TEXT, contact TEXT, status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (listing_id) REFERENCES seller_listings(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);");
  if (db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    const bcrypt = require('bcryptjs');
    db.prepare("INSERT INTO users (username, email, password, role) VALUES (?,?,?,?)").run('admin','admin@cmgm.com',bcrypt.hashSync('admin123',10),'admin');
    db.prepare("INSERT INTO users (username, email, password, role, balance) VALUES (?,?,?,?,?)").run('player1','player1@gmail.com',bcrypt.hashSync('user123',10),'user',500000);
    const ig = db.prepare('INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
    [['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]].forEach(g => ig.run(...g));
    const ip = db.prepare('INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)');
    ip.run(1,'86 Diamonds',19500,22000,1,1); ip.run(1,'172 Diamonds',38500,null,0,2); ip.run(2,'140 Diamonds',18500,null,0,1); ip.run(2,'355 Diamonds',46500,50000,1,2); ip.run(4,'125 VP',15000,null,0,1); ip.run(4,'420 VP',49000,50000,1,2);
  }
  module.exports = db;
} catch (e) {
  // Fallback to sql.js if better-sqlite3 fails
  usingSqlJs = true;
  console.log('better-sqlite3 failed, using sql.js fallback:', e.message);
  const initSqlJs = require('sql.js');
  initSqlJs().then(SQL => {
    let buffer;
    try { buffer = fs.readFileSync(dbPath); } catch(e) { buffer = null; }
    db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    initTables(db);
    const cnt = db.exec("SELECT COUNT(*) as c FROM users");
    if (!cnt[0] || cnt[0].values[0][0] === 0) { seedData(db); saveDb(); }
    const wrapper = createSyncWrapper(db);
    // Replace module.exports
    Object.keys(wrapper).forEach(k => { try { delete require.cache[require.resolve(__filename)]; } catch(e) {} });
    module.exports = wrapper;
  }).catch(err => { console.error('sql.js fallback also failed:', err); process.exit(1); });
  
  // Return stub that waits for real init
  let _ready = false;
  const stub = {
    _waitReady() { if (!_ready) throw new Error('Database not ready yet'); },
    prepare(sql) { this._waitReady(); return { run:()=>{}, get:()=>({}), all:()=>[] }; },
    exec() {}, pragma() {}
  };
  // When sql.js is ready, hijack stub methods
  module.exports = stub;
}
