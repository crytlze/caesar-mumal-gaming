const express = require('express');
const router = express.Router();
const db = require('../models/database');

// Dynamic Sitemap XML
router.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://caesar-mumal-gaming-production.up.railway.app';
  
  const games = db.prepare('SELECT slug, created_at FROM games WHERE is_active = 1').all();
  const listings = db.prepare("SELECT id, created_at FROM seller_listings WHERE status = 'approved'").all();
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  
  // Static pages
  const staticPages = [
    { loc: '', priority: '1.0', changefreq: 'daily' },
    { loc: '/joki', priority: '0.8', changefreq: 'weekly' },
    { loc: '/akun-game', priority: '0.8', changefreq: 'weekly' },
    { loc: '/seller/marketplace', priority: '0.9', changefreq: 'hourly' },
    { loc: '/auth/login', priority: '0.5', changefreq: 'monthly' },
    { loc: '/auth/register', priority: '0.5', changefreq: 'monthly' },
    { loc: '/search', priority: '0.6', changefreq: 'weekly' },
  ];
  
  staticPages.forEach(p => {
    xml += `<url><loc>${baseUrl}${p.loc}</loc><priority>${p.priority}</priority><changefreq>${p.changefreq}</changefreq></url>`;
  });
  
  // Game pages
  games.forEach(g => {
    const lastmod = new Date(g.created_at || Date.now()).toISOString();
    xml += `<url><loc>${baseUrl}/game/${g.slug}</loc><priority>0.9</priority><changefreq>daily</changefreq><lastmod>${lastmod}</lastmod></url>`;
  });
  
  // Listing pages
  listings.forEach(l => {
    const lastmod = new Date(l.created_at || Date.now()).toISOString();
    xml += `<url><loc>${baseUrl}/seller/listing/${l.id}</loc><priority>0.7</priority><changefreq>weekly</changefreq><lastmod>${lastmod}</lastmod></url>`;
  });
  
  xml += '</urlset>';
  
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

// Robots.txt
router.get('/robots.txt', (req, res) => {
  res.header('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: https://caesar-mumal-gaming-production.up.railway.app/sitemap.xml
`);
});

module.exports = router;
