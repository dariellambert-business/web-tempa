/**
 * Web Tempa — Prompt Template Matcher
 *
 * Matches a client's bidang_usaha (industry field) to the best-fit
 * prompt template from the 1001-entry collection.
 *
 * Usage:
 *   const { matchTemplate, buildPrompt } = require('./match-template');
 *   const match = matchTemplate("Skincare lokal");
 *   const prompt = buildPrompt(match.code, clientData);
 */

const fs = require('fs');
const path = require('path');

// Load index (lightweight) and full prompts (on demand)
const INDEX_PATH = path.join(__dirname, '..', 'data', 'bp_index.json');
const PROMPTS_PATH = path.join(__dirname, '..', 'data', 'bp_prompts.json');

let _index = null;
let _prompts = null;

function getIndex() {
  if (!_index) {
    _index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  }
  return _index;
}

function getPrompts() {
  if (!_prompts) {
    _prompts = JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'));
  }
  return _prompts;
}

/**
 * Normalize Indonesian text for matching
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize text into meaningful words
 */
function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter(w => w.length > 1);
}

/**
 * Calculate match score between query tokens and entry
 * Uses a weighted scoring: exact title word match > keyword match > partial match
 */
function scoreEntry(queryTokens, entry) {
  const titleTokens = tokenize(entry.t);
  const keywordStr = (entry.k + ' ' + entry.s).toLowerCase();

  let score = 0;

  for (const qt of queryTokens) {
    // Exact match in title words (highest weight)
    if (titleTokens.includes(qt)) {
      score += 10;
      continue;
    }

    // Partial match in title (e.g. "skin" matches "skincare")
    const titlePartial = titleTokens.some(tt => tt.includes(qt) || qt.includes(tt));
    if (titlePartial) {
      score += 6;
      continue;
    }

    // Match in keywords/subtitle
    if (keywordStr.includes(qt)) {
      score += 3;
      continue;
    }
  }

  // Bonus: if all query tokens matched something
  const matchedCount = queryTokens.filter(qt => {
    const inTitle = titleTokens.some(tt => tt.includes(qt) || qt.includes(tt));
    const inKw = keywordStr.includes(qt);
    return inTitle || inKw;
  }).length;

  if (matchedCount === queryTokens.length && queryTokens.length > 1) {
    score += 5; // Full coverage bonus
  }

  // Normalize by query length to avoid bias toward longer queries
  return score;
}

/**
 * Match client's bidang_usaha to the best template(s)
 *
 * @param {string} bidangUsaha - Client's industry/business field
 * @param {object} [opts] - Options
 * @param {number} [opts.topN=5] - Number of top matches to return
 * @param {string} [opts.tipeBisnis] - Optional tipe_bisnis hint to refine mesin selection
 * @returns {Array<{code, title, brand, mesin, score, designStyle}>}
 */
function matchTemplate(bidangUsaha, opts = {}) {
  const { topN = 5, tipeBisnis } = opts;
  const index = getIndex();
  const queryTokens = tokenize(bidangUsaha);

  if (queryTokens.length === 0) {
    return [];
  }

  // Score all entries
  let scored = index.entries.map(entry => ({
    code: entry.c,
    title: entry.t,
    brand: entry.b,
    mesin: entry.m,
    designStyle: entry.d,
    subtitle: entry.s,
    pages: entry.p,
    score: scoreEntry(queryTokens, entry),
  }));

  // If tipeBisnis hints at a mesin type, give a bonus
  if (tipeBisnis) {
    const mesinHints = {
      'makanan': 'M1', 'minuman': 'M1', 'fnb': 'M1', 'f&b': 'M1',
      'restoran': 'M1', 'cafe': 'M1', 'catering': 'M1', 'kuliner': 'M1',
      'booking': 'M2', 'jadwal': 'M2', 'reservasi': 'M2', 'appointment': 'M2',
      'jasa': 'M2', 'sewa': 'M2', 'rental': 'M2',
      'toko': 'M3', 'retail': 'M3', 'katalog': 'M3', 'produk': 'M3', 'jualan': 'M3',
      'properti': 'M4', 'listing': 'M4', 'kost': 'M4', 'gedung': 'M4', 'villa': 'M4',
      'perusahaan': 'M5', 'company': 'M5', 'b2b': 'M5', 'corporate': 'M5', 'konsultan': 'M5',
      'portfolio': 'M6', 'portofolio': 'M6', 'personal': 'M6', 'freelance': 'M6', 'kreatif': 'M6',
    };
    const tipeTokens = tokenize(tipeBisnis);
    for (const tt of tipeTokens) {
      if (mesinHints[tt]) {
        scored = scored.map(s => ({
          ...s,
          score: s.mesin === mesinHints[tt] ? s.score + 2 : s.score,
        }));
        break;
      }
    }
  }

  // Sort by score desc, take topN
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).filter(s => s.score > 0);
}

/**
 * Get full prompt data for a matched template code
 *
 * @param {string} code - 4-digit template code
 * @returns {object|null} Full prompt entry
 */
function getFullPrompt(code) {
  const prompts = getPrompts();
  return prompts.entries.find(e => e.code === code) || null;
}

/**
 * Build a personalized prompt from template + client data
 *
 * @param {string} code - Template code from matchTemplate result
 * @param {object} client - Client data from form submission
 * @returns {object} { prompt1, dataProduk, mesin, designStyle }
 */
function buildPrompt(code, client) {
  const template = getFullPrompt(code);
  if (!template) return null;

  // Replace fictional brand/business details with client's actual data
  let prompt = template.prompt1;

  // Replace brand name
  if (client.nama_bisnis && template.brand) {
    prompt = prompt.replace(new RegExp(escapeRegex(template.brand), 'gi'), client.nama_bisnis);
  }

  // Replace subtitle/description
  if (client.deskripsi_bisnis && template.brand) {
    const subtitleMatch = prompt.match(/called\s+"[^"]+"\s*\(([^)]+)\)/);
    if (subtitleMatch) {
      prompt = prompt.replace(subtitleMatch[1], client.deskripsi_bisnis);
    }
  }

  // Replace colors if client specified
  if (client.warna_brand) {
    // Insert client's color preference note
    prompt = prompt.replace(
      /DESIGN SYSTEM[^\n]*/,
      `$&\n[CLIENT BRAND COLORS: ${client.warna_brand} — adapt the palette to incorporate these]`
    );
  }

  // Replace city/location references
  if (client.kota) {
    prompt = prompt.replace(/\[kota\]/gi, client.kota);
  }

  // Add client context header
  const header = [
    `=== CLIENT CONTEXT ===`,
    `Business: ${client.nama_bisnis || 'TBD'}`,
    `Industry: ${client.bidang_usaha || template.title}`,
    `City: ${client.kota || '-'}`,
    `USP: ${client.usp || '-'}`,
    `Description: ${client.deskripsi_bisnis || '-'}`,
    `Tone/Style: ${client.tone_dan_gaya || '-'}`,
    `Brand Colors: ${client.warna_brand || 'use template defaults'}`,
    `Existing Branding: ${client.branding_existing || 'none'}`,
    `Target Pages: ${client.halaman_dibutuhkan || template.pages.join(', ')}`,
    `Features: ${client.fitur || '-'}`,
    `======================`,
    '',
  ].join('\n');

  return {
    mesin: template.mesin,
    designStyle: template.design_system_style,
    templateCode: code,
    templateTitle: template.title,
    prompt1: header + prompt,
    dataProduk: template.data_produk,
    pages: template.pages,
    linkedPrompts: template.linked_prompts,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CLI usage
if (require.main === module) {
  const query = process.argv[2];
  if (!query) {
    console.log('Usage: node match-template.js "bidang usaha"');
    console.log('Example: node match-template.js "Skincare lokal"');
    process.exit(1);
  }

  const matches = matchTemplate(query, { topN: 5 });

  console.log(`\nQuery: "${query}"`);
  console.log(`Found ${matches.length} matches:\n`);

  matches.forEach((m, i) => {
    console.log(`${i + 1}. [${m.code}] ${m.title}`);
    console.log(`   Brand: ${m.brand} | Mesin: ${m.mesin} | Style: ${m.designStyle}`);
    console.log(`   Score: ${m.score}`);
    console.log('');
  });
}

module.exports = { matchTemplate, getFullPrompt, buildPrompt };
