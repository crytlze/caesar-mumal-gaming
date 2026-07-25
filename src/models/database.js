/**
 * Caesar Mumal Gaming Database
 * 
 * Local: better-sqlite3 (fast, full SQL)
 * Vercel: JSON-file based DB (works on read-only filesystem)
 * 
 * Both expose the same: .prepare(sql).run() / .get() / .all()
 */

const path = require('path');
const fs = require('fs');
const isVercel = !!process.env.VERCEL;

const dbDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dbDir)) {
  try { fs.mkdirSync(dbDir, { recursive: true }); } catch(e) {}
}
const dbPath = path.join(dbDir, 'ciboy.db');

// ========================
// ATTEMPT 1: better-sqlite3 (local / Railway)
// ========================
function initBetterSqlite3() {
  const Database = require('better-sqlite3');
  const d = new Database(dbPath);
  try { d.pragma('journal_mode = WAL'); } catch(e) {}
  d.pragma('foreign_keys = ON');

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

  SCHEMA.forEach(s => { try { d.exec(s); } catch(e) { console.error('Schema error:', e.message); } });

  if (d.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    seedBetterSqlite3(d);
  }
  return d;
}

function seedBetterSqlite3(d) {
  const bcrypt = require('bcryptjs');
  d.prepare("INSERT INTO users (username, email, password, role, balance) VALUES (?,?,?,?,?)").run('admin', 'admin@cmgm.com', bcrypt.hashSync('admin123', 10), 'admin', 0);
  d.prepare("INSERT INTO users (username, email, password, role, balance) VALUES (?,?,?,?,?)").run('player1', 'player1@gmail.com', bcrypt.hashSync('user123', 10), 'user', 500000);
  const ig = d.prepare('INSERT INTO games (name,slug,description,logo,id_label,id_placeholder,server_label,server_placeholder,has_server,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
  [
    ['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],
    ['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],
    ['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],
    ['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],
    ['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]
  ].forEach(g => { try { ig.run(g); } catch(e) {} });
  const ip = d.prepare('INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?,?,?,?,?,?)');
  [
    [1,'86 Diamonds',19500,22000,1,1],
    [1,'172 Diamonds',38500,null,0,2],
    [2,'140 Diamonds',18500,null,0,1],
    [2,'355 Diamonds',46500,50000,1,2],
    [4,'125 VP',15000,null,0,1],
    [4,'420 VP',49000,50000,1,2]
  ].forEach(p => { try { ip.run(p); } catch(e) {} });
}

// ========================
// ATTEMPT 2: JSON File Database (Vercel)
// ========================
class JsonDB {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      // In Vercel, /tmp is writable
      const tmpPath = '/tmp/ciboy-data.json';
      let p = this.filePath;
      // Try tmp first (Vercel writable dir)
      try {
        if (fs.existsSync(tmpPath)) {
          const raw = fs.readFileSync(tmpPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed._tables) return parsed;
        }
        // Try original path
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed._tables) return parsed;
        }
      } catch(e) {}
    } catch(e) {}

    // Fresh start with all tables
    const data = { _tables: {} };
    return data;
  }

  _save() {
    try {
      const tmpPath = '/tmp/ciboy-data.json'; // Always save to /tmp on Vercel
      fs.writeFileSync(tmpPath, JSON.stringify(this.data));
      // Also try original path (may fail on Vercel, that's OK)
      try { fs.writeFileSync(this.filePath, JSON.stringify(this.data)); } catch(e) {}
    } catch(e) {}
  }

  _getTable(tableName) {
    if (!this.data._tables[tableName]) {
      this.data._tables[tableName] = { _rows: [], _nextId: 1 };
    }
    return this.data._tables[tableName];
  }

  prepare(sql) {
    const parsed = this._parseSQL(sql);
    if (!parsed) {
      return { run: () => ({ changes: 0 }), get: () => null, all: () => [] };
    }
    return new JsonStatement(this, parsed);
  }

  exec(sql) {
    // exec is used for multi-statement / DDL
    // For simplicity, just parse and run the create table
    const match = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
    if (match) {
      const tableName = match[1];
      if (!this.data._tables[tableName]) {
        this.data._tables[tableName] = { _rows: [], _nextId: 1 };
        this._save();
      }
    }
  }

  pragma() {}

  _parseSQL(sql) {
    sql = sql.trim();

    // CREATE TABLE
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
    if (createMatch) {
      return { type: 'create', table: createMatch[1] };
    }

    // INSERT
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]*)\))?\s*VALUES\s*\(([^)]*)\)/i);
    if (insertMatch) {
      return {
        type: 'insert',
        table: insertMatch[1],
        columns: insertMatch[2] ? insertMatch[2].split(',').map(c => c.trim()) : null,
        placeholders: insertMatch[3].split(',').map(c => c.trim())
      };
    }

    // SELECT
    const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/is);
    if (selectMatch) {
      return {
        type: 'select',
        columns: selectMatch[1].trim(),
        table: selectMatch[2],
        where: selectMatch[3] ? selectMatch[3].trim() : null,
        orderBy: selectMatch[4] ? selectMatch[4].trim() : null,
        limit: selectMatch[5] ? parseInt(selectMatch[5]) : null,
        offset: selectMatch[6] ? parseInt(selectMatch[6]) : null
      };
    }

    // UPDATE
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*?))?$/i);
    if (updateMatch) {
      return {
        type: 'update',
        table: updateMatch[1],
        set: updateMatch[2].trim(),
        where: updateMatch[3] ? updateMatch[3].trim() : null
      };
    }

    // DELETE
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?$/i);
    if (deleteMatch) {
      return {
        type: 'delete',
        table: deleteMatch[1],
        where: deleteMatch[2] ? deleteMatch[2].trim() : null
      };
    }

    // COUNT(*) — special case
    const countMatch = sql.match(/SELECT\s+COUNT\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?$/i);
    if (countMatch) {
      return {
        type: 'count',
        alias: countMatch[1],
        table: countMatch[2],
        where: countMatch[3] ? countMatch[3].trim() : null
      };
    }

    // COALESCE / SUM
    const sumMatch = sql.match(/SELECT\s+COALESCE\(SUM\((\w+)\)\s*,\s*(\d+)\)\s+as\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?$/i);
    if (sumMatch) {
      return {
        type: 'sum',
        field: sumMatch[1],
        default: sumMatch[2],
        alias: sumMatch[3],
        table: sumMatch[4],
        where: sumMatch[5] ? sumMatch[5].trim() : null
      };
    }

    // ROUND(AVG(...))
    const avgMatch = sql.match(/SELECT\s+ROUND\(AVG\((\w+)\)\s*,\s*(\d+)\)\s+as\s+(\w+).*?\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?/is);
    if (avgMatch) {
      return {
        type: 'avg',
        field: avgMatch[1],
        decimals: parseInt(avgMatch[2]),
        alias: avgMatch[3],
        table: avgMatch[4],
        where: avgMatch[5] ? avgMatch[5].trim() : null
      };
    }

    // Simple JOIN (SELECT with JOIN)
    const joinMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)\s+(?:INNER\s+)?JOIN\s+(\w+)\s+ON\s+(.*?)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/is);
    if (joinMatch) {
      return {
        type: 'select_join',
        columns: joinMatch[1].trim(),
        table: joinMatch[2],
        joinTable: joinMatch[3],
        joinOn: joinMatch[4].trim(),
        where: joinMatch[5] ? joinMatch[5].trim() : null,
        orderBy: joinMatch[6] ? joinMatch[6].trim() : null,
        limit: joinMatch[7] ? parseInt(joinMatch[7]) : null,
        offset: joinMatch[8] ? parseInt(joinMatch[8]) : null
      };
    }

    // GROUP BY queries used in admin dashboard for order stats
    const groupMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?\s+GROUP\s+BY\s+(.*?)(?:\s+ORDER\s+BY\s+(.*?))?$/is);
    if (groupMatch) {
      return {
        type: 'select_group',
        columns: groupMatch[1].trim(),
        table: groupMatch[2],
        where: groupMatch[3] ? groupMatch[3].trim() : null,
        groupBy: groupMatch[4].trim(),
        orderBy: groupMatch[5] ? groupMatch[5].trim() : null
      };
    }

    // DATE query
    const dateGroupMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)\s+WHERE\s+(.*?)\s+GROUP\s+BY\s+(.*?)\s+ORDER\s+BY\s+(.*?)$/is);
    if (dateGroupMatch) {
      return {
        type: 'select_group',
        columns: dateGroupMatch[1].trim(),
        table: dateGroupMatch[2],
        where: dateGroupMatch[3].trim(),
        groupBy: dateGroupMatch[4].trim(),
        orderBy: dateGroupMatch[5].trim()
      };
    }

    // Complex GROUP BY (admin dashboard top products)
    const complexGroupMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)\s+(\w+)\s+JOIN\s+\w+\s+\w+\s+ON\s+.*?\s+WHERE\s+(.*?)\s+GROUP\s+BY\s+(.*?)\s+ORDER\s+BY\s+(.*?)\s+LIMIT\s+(\d+)/is);
    if (complexGroupMatch) {
      return {
        type: 'select_group',
        columns: complexGroupMatch[1].trim(),
        table: complexGroupMatch[2],
        where: complexGroupMatch[3].trim(),
        groupBy: complexGroupMatch[4].trim(),
        orderBy: complexGroupMatch[5].trim(),
        limit: parseInt(complexGroupMatch[6])
      };
    }

    return null;
  }

  _evaluateWhere(where, row) {
    if (!where) return true;

    // Handle IN clauses
    const inMatch = where.match(/(\w+)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const field = inMatch[1];
      const values = inMatch[2].split(',').map(v => v.trim().replace(/['"]/g, ''));
      const rowVal = String(row[field] !== undefined ? row[field] : '');
      return values.includes(rowVal);
    }

    // Handle AND / OR conditions
    const conditions = where.split(/\s+AND\s+|\s+OR\s+/i);
    const separators = where.match(/\s+AND\s+|\s+OR\s+/gi);

    // Simple single condition
    if (conditions.length === 1) {
      return this._evalCondition(conditions[0], row);
    }

    let result = this._evalCondition(conditions[0], row);
    for (let i = 0; i < (separators || []).length && i + 1 < conditions.length; i++) {
      const next = this._evalCondition(conditions[i + 1], row);
      if (separators[i].toUpperCase().includes('AND')) result = result && next;
      else result = result || next;
    }
    return result;
  }

  _evalCondition(cond, row) {
    cond = cond.trim();
    
    // LIKE
    const likeMatch = cond.match(/(\w+)\s+LIKE\s+(.+)/i);
    if (likeMatch) {
      const field = likeMatch[1];
      let pattern = likeMatch[2].trim().replace(/^['"]|['"]$/g, '');
      const rowVal = String(row[field] !== undefined ? row[field] : '');
      if (pattern.includes('%')) {
        pattern = pattern.replace(/%/g, '.*');
        return new RegExp('^' + pattern + '$', 'i').test(rowVal);
      }
      return rowVal.includes(pattern);
    }

    // !=
    const neqMatch = cond.match(/(\w+)\s*!=\s*(.+)/);
    if (neqMatch) {
      const field = neqMatch[1];
      let val = neqMatch[2].trim().replace(/^['"]|['"]$/g, '');
      const rowVal = row[field] !== undefined ? String(row[field]) : '';
      return rowVal !== val;
    }

    // >=
    const gteMatch = cond.match(/(\w+)\s*>=\s*(.+)/);
    if (gteMatch) {
      const field = gteMatch[1];
      const val = parseFloat(gteMatch[2]);
      const rowVal = parseFloat(row[field]) || 0;
      return rowVal >= val;
    }

    // <=
    const lteMatch = cond.match(/(\w+)\s*<=\s*(.+)/);
    if (lteMatch) {
      const field = lteMatch[1];
      const val = parseFloat(lteMatch[2]);
      const rowVal = parseFloat(row[field]) || 0;
      return rowVal <= val;
    }

    // >
    const gtMatch = cond.match(/(\w+)\s*>\s*(.+)/);
    if (gtMatch) {
      const field = gtMatch[1];
      const val = parseFloat(gtMatch[2]);
      const rowVal = parseFloat(row[field]) || 0;
      return rowVal > val;
    }

    // <
    const ltMatch = cond.match(/(\w+)\s*<\s*(.+)/);
    if (ltMatch) {
      const field = ltMatch[1];
      const val = parseFloat(ltMatch[2]);
      const rowVal = parseFloat(row[field]) || 0;
      return rowVal < val;
    }

    // =
    const eqMatch = cond.match(/(\w+)\s*=\s*(.+)/);
    if (eqMatch) {
      const field = eqMatch[1];
      let val = eqMatch[2].trim().replace(/^['"]|['"]$/g, '');
      if (val.toUpperCase() === 'NULL') return row[field] === null || row[field] === undefined;
      if (val.toUpperCase() === 'DATETIME') return true; // skip datetime('now') conditions
      if (val.match(/^[\d.]+$/)) return parseFloat(row[field]) === parseFloat(val);
      return String(row[field] || '') === val;
    }

    return true;
  }

  _getColumnValue(row, colExpr) {
    colExpr = colExpr.trim();
    // Handle table.column notation
    const dotMatch = colExpr.match(/(\w+)\.(\w+)/);
    if (dotMatch) {
      return row[dotMatch[2]];
    }
    // Handle CAST or function
    if (colExpr.includes('(')) return row[colExpr.replace(/.*\((\w+)\).*/, '$1')] || colExpr;
    // Simple column
    return row[colExpr] !== undefined ? row[colExpr] : colExpr;
  }

  _applyOrderBy(rows, orderBy) {
    if (!orderBy) return rows;
    const parts = orderBy.split(',');
    let sorted = [...rows];
    parts.forEach(p => {
      const m = p.trim().match(/(\S+)\s+(ASC|DESC)?/i);
      if (m) {
        const field = m[1];
        const desc = m[2] && m[2].toUpperCase() === 'DESC';
        sorted.sort((a, b) => {
          const va = a[field] || 0;
          const vb = b[field] || 0;
          if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb;
          return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
        });
      }
    });
    return sorted;
  }
}

class JsonStatement {
  constructor(db, parsed) {
    this.db = db;
    this.parsed = parsed;
  }

  run(...params) {
    const p = this.parsed;
    const table = this.db._getTable(p.table);
    const args = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

    if (p.type === 'create') {
      return { changes: 0 };
    }

    if (p.type === 'insert') {
      const id = table._nextId++;
      const row = { id };
      // Map columns to values
      if (p.columns) {
        const cols = p.columns;
        const vals = args.slice(0, cols.length);
        cols.forEach((c, i) => { row[c] = vals[i]; });
      } else {
        // No columns specified: map by position (id is auto)
        const valIdx = 0;
        // Just take all args as values
        const fields = ['username','email','password','role','balance','game_id','name','price','original_price','is_promo','sort_order','user_id','category','game_name','title','description','contact','status','featured','views','listing_id','rating','comment','token','expires_at','used','type','message','link','is_read','quantity','total_price','payment_method','notes','game_user_id','game_server','order_id','product_id','image_url','slug','logo','server_label','server_placeholder','has_server','is_active','sort_order','id_label','id_placeholder','banner','description'];
        const tableFields = this.db._getTable(p.table);
        // Get the table's own columns from schema
        if (p.table === 'users') { row.username = args[0]; row.email = args[1]; row.password = args[2]; row.role = args[3] || 'user'; row.balance = args[4] || 0; }
        else if (p.table === 'seller_listings') { row.user_id = args[0]; row.category = args[1]; row.game_name = args[2]; row.title = args[3]; row.description = args[4] || ''; row.price = args[5]; row.original_price = args[6]; row.image_url = args[7] || ''; row.contact = args[8] || ''; row.status = 'pending'; }
        else if (p.table === 'reviews') { row.listing_id = args[0]; row.user_id = args[1]; row.rating = args[2]; row.comment = args[3] || ''; }
        else if (p.table === 'products') { row.game_id = args[0]; row.name = args[1]; row.price = args[2]; row.original_price = args[3]; row.is_promo = args[4] || 0; row.sort_order = args[5] || 0; row.is_active = 1; }
        else if (p.table === 'games') { row.name = args[0]; row.slug = args[1]; row.description = args[2]; row.logo = args[3]; row.id_label = args[4]; row.id_placeholder = args[5]; row.server_label = args[6]; row.server_placeholder = args[7]; row.has_server = args[8]; row.sort_order = args[9]; row.is_active = 1; }
        else if (p.table === 'orders') { row.order_id = args[0]; row.user_id = args[1]; row.game_id = args[2]; row.product_id = args[3]; row.game_user_id = args[4]; row.game_server = args[5] || ''; row.quantity = args[6] || 1; row.total_price = args[7]; row.payment_method = 'saldo'; row.status = 'pending'; }
        else if (p.table === 'notifications') { row.user_id = args[0]; row.type = args[1]; row.title = args[2]; row.message = args[3] || ''; row.link = args[4] || ''; row.is_read = 0; }
        else if (p.table === 'password_resets') { row.user_id = args[0]; row.token = args[1]; row.expires_at = args[2]; row.used = 0; }
        else if (p.table === 'wishlist') { row.user_id = args[0]; row.listing_id = args[1]; }
        else { args.forEach((v, i) => { row[fields[i] || 'col' + i] = v; }); }
      }
      row.created_at = new Date().toISOString().replace('T', ' ').split('.')[0];
      if (p.table === 'seller_listings' || p.table === 'orders') row.updated_at = row.created_at;
      table._rows.push(row);
      this.db._save();
      return { changes: 1, lastInsertRowid: id };
    }

    if (p.type === 'update') {
      let count = 0;
      const setParts = p.set.split(',').map(s => s.trim());
      table._rows.forEach(row => {
        if (this.db._evaluateWhere(p.where, row)) {
          setParts.forEach(sp => {
            const m = sp.match(/(\w+)\s*=\s*(.+)/);
            if (m) {
              let val = m[2].trim().replace(/^['"]|['"]$/g, '');
              if (val.toUpperCase() === 'CURRENT_TIMESTAMP') val = new Date().toISOString().replace('T', ' ').split('.')[0];
              if (val.match(/^\d+(\.\d+)?$/)) row[m[1]] = parseFloat(val);
              else row[m[1]] = val;
            }
          });
          count++;
        }
      });
      this.db._save();
      return { changes: count };
    }

    if (p.type === 'delete') {
      const before = table._rows.length;
      table._rows = table._rows.filter(row => !this.db._evaluateWhere(p.where, row));
      const after = table._rows.length;
      this.db._save();
      return { changes: before - after };
    }

    return { changes: 0 };
  }

  get(...params) {
    const results = this.all(...params);
    return results.length > 0 ? results[0] : null;
  }

  all(...params) {
    const p = this.parsed;
    if (!p) return [];

    const table = this.db._getTable(p.table);
    let rows = [...table._rows];

    if (p.type === 'count' || p.type === 'select') {
      if (p.where) rows = rows.filter(row => this.db._evaluateWhere(p.where, row));
    }

    // SELECT with JOIN - simple direct implementation
    if (p.type === 'select_join') {
      const joinTable = this.db._getTable(p.joinTable);
      const joinField = p.joinOn.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
      let results = [];
      
      if (joinField) {
        const t1Field = joinField[2];
        const t2Field = joinField[4];
        
        rows.forEach(r1 => {
          joinTable._rows.forEach(r2 => {
            if (String(r1[t1Field]) === String(r2[t2Field])) {
              // Apply WHERE
              const combined = { ...r1, ...r2 };
              if (this.db._evaluateWhere(p.where, combined)) {
                results.push(combined);
              }
            }
          });
        });
      } else {
        // Cross join
        rows.forEach(r1 => {
          joinTable._rows.forEach(r2 => {
            const combined = { ...r1, ...r2 };
            results.push(combined);
          });
        });
      }
      
      if (p.orderBy) results = this.db._applyOrderBy(results, p.orderBy);
      if (p.limit) results = results.slice(0, p.limit);
      if (p.offset) results = results.slice(p.offset || 0);
      
      // Map columns
      return results.map(r => {
        const obj = {};
        p.columns.split(',').forEach(c => {
          const cTrim = c.trim();
          const asMatch = cTrim.match(/(.+)\s+as\s+(\w+)/i);
          if (asMatch) {
            obj[asMatch[2]] = this.db._getColumnValue(r, asMatch[1]);
          } else if (cTrim === '*') {
            Object.assign(obj, r);
          } else if (cTrim.includes('.')) {
            const dotParts = cTrim.split('.');
            obj[dotParts[1]] = r[dotParts[1]];
          } else {
            obj[cTrim] = r[cTrim];
          }
        });
        return obj;
      });
    }

    // COUNT
    if (p.type === 'count') {
      let c = rows.length;
      if (p.where) c = rows.filter(row => this.db._evaluateWhere(p.where, row)).length;
      const obj = {};
      obj[p.alias] = c;
      return [obj];
    }

    // SUM
    if (p.type === 'sum') {
      let total = 0;
      rows.forEach(row => { total += parseFloat(row[p.field] || 0); });
      const obj = {};
      obj[p.alias] = total;
      return [obj];
    }

    // AVG
    if (p.type === 'avg') {
      let total = 0;
      let count = 0;
      rows.forEach(row => {
        const v = parseFloat(row[p.field]);
        if (!isNaN(v)) { total += v; count++; }
      });
      const obj = {};
      obj[p.alias] = count > 0 ? parseFloat((total / count).toFixed(p.decimals)) : 0;
      return [obj];
    }

    // GROUP BY (simplified for orders status chart)
    if (p.type === 'select_group') {
      const groupFields = p.groupBy.split(',').map(g => g.trim());
      const groupField = groupFields[0].replace(/^(\w+\.)?/, '').replace(/.*\.(\w+)/, '$1');
      
      const groups = {};
      rows.forEach(row => {
        const key = row[groupField] || 'unknown';
        if (!groups[key]) groups[key] = { _rows: [], _count: 0 };
        groups[key]._rows.push(row);
        groups[key]._count++;
      });
      
      let results = Object.entries(groups).map(([key, grp]) => {
        const obj = {};
        // Parse columns
        p.columns.split(',').forEach(c => {
          c = c.trim();
          const asMatch = c.match(/(.+)\s+as\s+(\w+)/i);
          const colName = asMatch ? asMatch[2] : c;
          const colExpr = asMatch ? asMatch[1] : c;
          
          if (colExpr === 'COUNT(*)') obj[colName] = grp._count;
          else if (colExpr.toUpperCase().includes('SUM')) {
            const sumField = colExpr.match(/SUM\((\w+)\)/i);
            if (sumField) {
              let s = 0;
              grp._rows.forEach(r => { s += parseFloat(r[sumField[1]] || 0); });
              obj[colName] = s;
            }
          }
          else if (colExpr === `'${key}'` || colExpr === `"${key}"`) obj[colName] = key;
          else if (colExpr.includes(groupField) || colExpr === groupField || colExpr === `DATE(${groupField})`) obj[colName] = key;
          else obj[colName] = grp._rows[0] ? grp._rows[0][colExpr] || colExpr : colExpr;
        });
        return obj;
      });
      
      if (p.orderBy) results = this.db._applyOrderBy(results, p.orderBy);
      if (p.limit) results = results.slice(0, p.limit);
      return results;
    }

    // Simple SELECT or COUNT with WHERE
    if (p.type === 'select') {
      let results = rows;
      if (p.where) results = results.filter(row => this.db._evaluateWhere(p.where, row));
      if (p.orderBy) results = this.db._applyOrderBy(results, p.orderBy);
      if (p.offset) results = results.slice(p.offset);
      if (p.limit) results = results.slice(0, p.limit);
      
      return results.map(r => {
        if (p.columns === '*') return r;
        const obj = {};
        p.columns.split(',').forEach(c => {
          c = c.trim();
          const asMatch = c.match(/(.+)\s+as\s+(\w+)/i);
          if (asMatch) { obj[asMatch[2]] = this.db._getColumnValue(r, asMatch[1]); }
          else if (c.includes('.')) { const dp = c.split('.'); obj[dp[1]] = r[dp[1]]; }
          else { obj[c] = r[c]; }
        });
        return obj;
      });
    }

    return [];
  }
}

// ========================
// AUTO-INIT
// ========================
let db;
let usingJson = false;

try {
  if (!isVercel) {
    // Local / Railway: better-sqlite3
    db = initBetterSqlite3();
    console.log('✅ Using better-sqlite3 (SQLite)');
  } else {
    // Vercel: JSON DB
    db = new JsonDB(path.join(__dirname, '..', '..', 'data', 'ciboy-data.json'));
    usingJson = true;
    // Seed JSON DB
    if (!db._getTable('users')._rows.length) {
      const bcrypt = require('bcryptjs');
      const users = db._getTable('users');
      users._rows.push({ id: users._nextId++, username: 'admin', email: 'admin@cmgm.com', password: bcrypt.hashSync('admin123', 10), role: 'admin', balance: 0, created_at: new Date().toISOString() });
      users._rows.push({ id: users._nextId++, username: 'player1', email: 'player1@gmail.com', password: bcrypt.hashSync('user123', 10), role: 'user', balance: 500000, created_at: new Date().toISOString() });
      
      const games = db._getTable('games');
      [
        ['Mobile Legends','mobile-legends','Top Up MLBB.','/img/games/mlbb.png','User ID','-','Zone ID','-',1,1],
        ['Free Fire','free-fire','Top Up FF.','/img/games/freefire.svg','Player ID','-','','',0,2],
        ['PUBG Mobile','pubg-mobile','UC PUBG.','/img/games/pubg.webp','Player ID','-','','',0,3],
        ['Valorant','valorant','VP Valorant.','/img/games/valorant.svg','Riot ID','-','','',0,4],
        ['Genshin Impact','genshin-impact','Genesis Crystal.','/img/games/genshin.svg','UID','-','Server','Asia',1,5]
      ].forEach(g => {
        games._rows.push({ id: games._nextId++, name: g[0], slug: g[1], description: g[2], logo: g[3], id_label: g[4], id_placeholder: g[5], server_label: g[6], server_placeholder: g[7], has_server: g[8], sort_order: g[9], is_active: 1, created_at: new Date().toISOString() });
      });
      
      const products = db._getTable('products');
      [
        [1,'86 Diamonds',19500,22000,1,1],
        [1,'172 Diamonds',38500,null,0,2],
        [2,'140 Diamonds',18500,null,0,1],
        [2,'355 Diamonds',46500,50000,1,2],
        [4,'125 VP',15000,null,0,1],
        [4,'420 VP',49000,50000,1,2]
      ].forEach(p => {
        products._rows.push({ id: products._nextId++, game_id: p[0], name: p[1], price: p[2], original_price: p[3], is_promo: p[4], sort_order: p[5], is_active: 1, created_at: new Date().toISOString() });
      });
      
      db._save();
    }
    console.log('📦 Using JSON DB (Vercel mode)');
  }
} catch (e) {
  console.error('DB init error:', e.message);
  // Ultimate fallback
  const stub = { prepare() { return { run(){return{changes:0}}, get(){return null}, all(){return[]} }; }, exec(){}, pragma(){} };
  module.exports = stub;
}

module.exports = db;
