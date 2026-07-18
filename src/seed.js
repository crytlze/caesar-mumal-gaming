const db = require('./models/database');
const bcrypt = require('bcryptjs');

console.log('Seeding data started...');

try {
  // Clear existing
  db.exec('DELETE FROM products; DELETE FROM games;');

  // Insert Admin
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run(
    'admin', 'admin@cmgm.com', adminPassword, 'admin'
  );
  
  // Insert User Test
  const userPassword = bcrypt.hashSync('user123', 10);
  db.prepare('INSERT OR IGNORE INTO users (username, email, password, role, balance) VALUES (?, ?, ?, ?, ?)').run(
    'player1', 'player1@gmail.com', userPassword, 'user', 500000
  );

  console.log('Users created:');
  console.log('Admin: admin / admin123');
  console.log('User: player1 / user123 (Saldo: Rp 500.000)');

  // Games
  const games = [
    {
      name: 'Mobile Legends', slug: 'mobile-legends', desc: 'Top Up Diamond Mobile Legends murah dan cepat.',
      logo: '/img/games/mlbb.png', label: 'User ID', ph: 'Contoh: 12345678',
      sLabel: 'Zone ID', sPh: 'Contoh: 1234', has_server: 1, sort: 1
    },
    {
      name: 'Free Fire', slug: 'free-fire', desc: 'Top Up Diamond FF harga paling miring.',
      logo: '/img/games/freefire.svg', label: 'Player ID', ph: 'Contoh: 87654321',
      sLabel: '', sPh: '', has_server: 0, sort: 2
    },
    {
      name: 'PUBG Mobile', slug: 'pubg-mobile', desc: 'Beli UC PUBG Mobile legal 100%.',
      logo: '/img/games/pubg.webp', label: 'Player ID', ph: 'Contoh: 51234567',
      sLabel: '', sPh: '', has_server: 0, sort: 3
    },
    {
      name: 'Valorant', slug: 'valorant', desc: 'Beli Valorant Points (VP) proses instan.',
      logo: '/img/games/valorant.svg', label: 'Riot ID', ph: 'Contoh: Player#1234',
      sLabel: '', sPh: '', has_server: 0, sort: 4
    },
    {
      name: 'Genshin Impact', slug: 'genshin-impact', desc: 'Genesis Crystal Genshin Impact murah.',
      logo: '/img/games/genshin.svg', label: 'UID', ph: 'Contoh: 801234567',
      sLabel: 'Server', sPh: 'Asia / America / Europe / TW, HK, MO', has_server: 1, sort: 5
    }
  ];

  const insertGame = db.prepare('INSERT INTO games (name, slug, description, logo, id_label, id_placeholder, server_label, server_placeholder, has_server, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  
  games.forEach(g => {
    insertGame.run(g.name, g.slug, g.desc, g.logo, g.label, g.ph, g.sLabel, g.sPh, g.has_server, g.sort);
  });
  console.log('Games seeded.');

  // Products
  const mlbbId = db.prepare("SELECT id FROM games WHERE slug='mobile-legends'").get()?.id || 1;
  const ffId = db.prepare("SELECT id FROM games WHERE slug='free-fire'").get()?.id || 2;
  const valId = db.prepare("SELECT id FROM games WHERE slug='valorant'").get()?.id || 4;

  const insertProduct = db.prepare('INSERT INTO products (game_id, name, price, original_price, is_promo, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

  // MLBB Products
  insertProduct.run(mlbbId, '86 Diamonds (78 + 8 Bonus)', 19500, 22000, 1, 1);
  insertProduct.run(mlbbId, '172 Diamonds (156 + 16 Bonus)', 38500, 40000, 0, 2);
  insertProduct.run(mlbbId, '257 Diamonds (234 + 23 Bonus)', 57500, null, 0, 3);
  insertProduct.run(mlbbId, 'Twilight Pass', 140000, 150000, 1, 4);

  // FF Products
  insertProduct.run(ffId, '140 Diamonds', 18500, null, 0, 1);
  insertProduct.run(ffId, '355 Diamonds', 46500, 50000, 1, 2);
  insertProduct.run(ffId, '720 Diamonds', 92500, null, 0, 3);

  // Valo Products
  insertProduct.run(valId, '125 Valorant Points', 15000, null, 0, 1);
  insertProduct.run(valId, '420 Valorant Points', 49000, 50000, 1, 2);

  console.log('Products seeded.');
  console.log('Seeding completed successfully!');
} catch (error) {
  console.error('Error seeding data:', error);
}
