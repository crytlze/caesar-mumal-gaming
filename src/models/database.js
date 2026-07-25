const path = require('path');
const fs = require('fs');
const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'ciboy.db');

const isVercel = !!process.env.VERCEL;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'user', balance REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, logo TEXT, banner TEXT, id_label TEXT DEFAULT 'User ID', id_placeholder TEXT DEFAULT 'Masukkan ID', server_label TEXT, server_placeholder TEXT, has_server INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, is_promo INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL, user_id INTEGER, game_id INTEGER NOT NULL, product_id INTEGER NOT NULL, game_user_id TEXT NOT NULL, game_server TEXT, quantity INTEGER DEFAULT 1, total_price REAL NOT NULL, payment_method TEXT DEFAULT 'saldo', status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (game_id) REFERENCES games(id), FOREIGN KEY (product_id) REFERENCES products(id))",
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
  "CREATE TABLE IF NOT EXISTS seller_listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, game_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, original_price REAL, image_url TEXT, contact TEXT, status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0, views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (listing_id) REFERENCES seller_listings(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS wishlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, listing_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, listing_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (listing_id) REFERENCES seller_listings(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)",
  "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, message TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"
];

const SEED_USERS = [
  { username: 'admin', email: 'admin@cmgm.com', password: 'admin123', role: 'admin', balance: 0 },
  { username: 'player1', email: 'player1@gmail.com', password: 'user123', role: 'user', balance: 500000 }
];

const SEED_GAMES = [
  ['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],
  ['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],
  ['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],
  ['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],
  ['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]
];

const SEED_PRODUCTS = [
  [1,'86 Diamonds',19500,22000,1,1],
  [1,'172 Diamonds',38500,null,0,2],
  [2,'140 Diamonds',18500,null,0,1],
  [2,'355 Diamonds',46500,50000,1,2],
  [4,'125 VP',15000,null,0,1],
  [4,'420 VP',49000,50000,1,2]
];

// ========================
// INIT WITH better-sqlite3 (SYNC)
// ========================
function initBetterSqlite3() {
  const Database = require('better-sqlite3');
  const d = new Database(dbPath);
  try { d.pragma('journal_mode = WAL'); } catch(e) {}
  d.pragma('foreign_keys = ON');
  
  SCHEMA.forEach(s => { try { d.exec(s); } catch(e) { console.error('Schema error:', e.message); } });
  
  if (d.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    const bcrypt = require('bcryptjs');
    SEED_USERS.forEach(u => {
      d.prepare("INSERT INTO users (username, email, password, role, balance) VALUES (?,?,?,?,?)")
        .run(u.username, u.email, bcrypt.hashSync(u.password, 10), u.role, u.balance);
    });
    const ig = d.prepare('INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
    SEED_GAMES.forEach(g => { try { ig.run(g); } catch(e) {} });
    const ip = d.prepare('INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)');
    SEED_PRODUCTS.forEach(p => { try { ip.run(p); } catch(e) {} });
  }
  
  return d;
}

// ========================
// INIT WITH sql.js (for Vercel)
// ========================
let _sqlJsReady = false;
let _sqlDb = null;
let _sqlWrapper = null;

function createSqlJsSyncWrapper(sqlDb) {
  function save() {
    try { fs.writeFileSync(dbPath, Buffer.from(sqlDb.export())); } catch(e) {}
  }
  return {
    prepare(sql) {
      let stmt;
      try { stmt = sqlDb.prepare(sql); } catch(e) { stmt = null; }
      return {
        run(...params) {
          try { if (stmt) { const a = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.bind(a); stmt.step(); stmt.free(); save(); } } catch(e) {}
          return { changes: 1, lastInsertRowid: 0 };
        },
        get(...params) {
          try { if (stmt) { const a = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.bind(a); if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; } stmt.free(); } } catch(e) {}
          return undefined;
        },
        all(...params) {
          const results = [];
          try { if (stmt) { const a = params.length === 1 && Array.isArray(params[0]) ? params[0] : params; stmt.bind(a); while (stmt.step()) results.push(stmt.getAsObject()); stmt.free(); } } catch(e) {}
          return results;
        }
      };
    },
    exec(sql) { try { sqlDb.run(sql); save(); } catch(e) {} },
    pragma() {}
  };
}

async function initSqlJsAsync() {
  const initSqlJs = require('sql.js');
  let buffer;
  try { buffer = fs.readFileSync(dbPath); } catch(e) { buffer = null; }
  
  const SQL = await initSqlJs({
    locateFile: file => {
      try { return require.resolve('sql.js/dist/' + file).replace(/\\/g, '/').replace(/^[A-Z]:/, ''); } catch(e) {
        return require('path').join(require('path').dirname(require.resolve('sql.js')), 'dist', file);
      }
    }
  });
  
  _sqlDb = buffer ? new SQL.Database(buffer) : new SQL.Database();
  
  SCHEMA.forEach(s => { try { _sqlDb.run(s); } catch(e) {} });
  
  // Check seed
  try {
    const r = _sqlDb.exec("SELECT COUNT(*) as c FROM users");
    const seeded = r && r[0] && r[0].values && r[0].values[0] && r[0].values[0][0] > 0;
    if (!seeded) {
      const bcrypt = require('bcryptjs');
      SEED_USERS.forEach(u => {
        _sqlDb.run("INSERT INTO users (username, email, password, role, balance) VALUES (?,?,?,?,?)",
          u.username, u.email, bcrypt.hashSync(u.password, 10), u.role, u.balance);
      });
      SEED_GAMES.forEach(g => {
        try { _sqlDb.run("INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)", ...g); } catch(e) {}
      });
      SEED_PRODUCTS.forEach(p => {
        try { _sqlDb.run("INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)", ...p); } catch(e) {}
      });
      try { fs.writeFileSync(dbPath, Buffer.from(_sqlDb.export())); } catch(e) {}
    }
  } catch(e) { console.error('Seed check error:', e.message); }
  
  _sqlWrapper = createSqlJsSyncWrapper(_sqlDb);
  _sqlJsReady = true;
  
  return _sqlWrapper;
}

// ========================
// EXPORT
// ========================
let db;

if (!isVercel) {
  // Local / Railway: use better-sqlite3 (fully sync)
  db = initBetterSqlite3();
  module.exports = db;
} else {
  // Vercel: use sql.js wrapper with ready check
  // Start async init immediately
  const initPromise = initSqlJsAsync().catch(err => {
    console.error('sql.js init failed on Vercel:', err.message);
    _sqlJsReady = true; // Allow requests to proceed (will get empty results)
  });
  
  // Create a proxy that works once ready
  const dbProxy = new Proxy({}, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) => ({
          run(...p) {
            if (_sqlJsReady && _sqlWrapper) return _sqlWrapper.prepare(sql).run(...p);
            return { changes: 0, lastInsertRowid: 0 };
          },
          get(...p) {
            if (_sqlJsReady && _sqlWrapper) return _sqlWrapper.prepare(sql).get(...p);
            return null;
          },
          all(...p) {
            if (_sqlJsReady && _sqlWrapper) return _sqlWrapper.prepare(sql).all(...p);
            return [];
          }
        });
      }
      if (prop === 'exec') return (sql) => { if (_sqlJsReady && _sqlDb) try { _sqlDb.run(sql); } catch(e) {} };
      if (prop === 'pragma') return () => {};
      return () => {};
    }
  });
  
  module.exports = dbProxy;
}
