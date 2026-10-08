#!/usr/bin/env node
/**
 * Build a lightweight search index from bp_prompts.json
 * Output: bp_index.json — compact lookup table for template matching
 */

const fs = require('fs');
const path = require('path');

const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'bp_prompts.json'), 'utf8'));

// Build compact index: code, title, brand, mesin, design_system_style, keywords
const index = src.entries.map(e => {
  // Extract keywords from title + first line of prompt1
  const titleWords = e.title.toLowerCase()
    .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  // Extract brand subtitle from prompt1 (the business description after brand name)
  const subtitleMatch = e.prompt1.match(/called\s+"[^"]+"\s*\(([^)]+)\)/);
  const subtitle = subtitleMatch ? subtitleMatch[1] : '';

  return {
    c: e.code,           // code
    t: e.title,          // title (industry name)
    b: e.brand,          // brand name
    m: e.mesin,          // mesin type
    d: e.design_system_style, // design system style
    s: subtitle,         // subtitle/description
    k: [...new Set(titleWords)].join(' '), // keywords
    p: e.pages,          // routes
  };
});

// Also extract mesin definitions for reference
const mesinDefs = {
  M1: { name: "ORDER", desc: "F&B — menu ordering, keranjang, checkout via WA", promptNums: "2, 3, 4" },
  M2: { name: "BOOKING", desc: "Jasa berjadwal — pilih paket, cek jadwal, booking via WA", promptNums: "2, 3, 4" },
  M3: { name: "KATALOG+WA", desc: "Retail/jasa non-jadwal — browse katalog, chat WA untuk beli", promptNums: "2, 3, 4" },
  M4: { name: "LISTING", desc: "Properti & unit — listing filter, detail unit, ketersediaan", promptNums: "2, 3, 4" },
  M5: { name: "COMPANY PROFILE", desc: "B2B — company profile, layanan, portofolio, kontak", promptNums: "2, 3, 4" },
  M6: { name: "PORTFOLIO", desc: "Personal/kreatif — portfolio showcase, booking diskusi", promptNums: "2, 3, 4" },
};

const output = {
  meta: {
    total: index.length,
    mesinDefs,
    built: new Date().toISOString().split('T')[0],
  },
  entries: index,
};

const outPath = path.join(__dirname, 'bp_index.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`Index built: ${index.length} entries → ${outPath}`);
console.log(`Size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
