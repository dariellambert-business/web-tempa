/**
 * Netlify Function: match-template
 *
 * POST /api/match-template
 * Body: { bidang_usaha, tipe_bisnis?, client_data? }
 *
 * Returns matched template(s) and optionally a built prompt.
 */

const { matchTemplate, buildPrompt } = require('../../lib/match-template');

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Simple auth check — Make.com sends this header
  const authToken = process.env.MATCH_API_TOKEN;
  if (authToken) {
    const provided = (event.headers['authorization'] || '').replace('Bearer ', '');
    if (provided !== authToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { bidang_usaha, tipe_bisnis, client_data, top_n = 5, auto_build = true } = body;

    if (!bidang_usaha) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'bidang_usaha is required' }),
      };
    }

    // Match templates
    const matches = matchTemplate(bidang_usaha, { topN: top_n, tipeBisnis: tipe_bisnis });

    if (matches.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ matches: [], built: null, message: 'No matching template found' }),
      };
    }

    // Auto-build prompt from best match if client_data provided
    let built = null;
    if (auto_build && matches.length > 0) {
      const clientObj = client_data || {};
      // Map Make.com field names to buildPrompt expected keys
      const client = {
        nama_bisnis: clientObj.nama_bisnis || clientObj['Nama Bisnis'] || '',
        bidang_usaha: clientObj.bidang_usaha || clientObj['Bidang Usaha'] || bidang_usaha,
        deskripsi_bisnis: clientObj.deskripsi_bisnis || clientObj['Deskripsi Bisnis'] || '',
        usp: clientObj.usp || clientObj['USP'] || '',
        kota: clientObj.kota || clientObj['Kota'] || '',
        tone_dan_gaya: clientObj.tone_dan_gaya || clientObj['Tone & Gaya'] || '',
        warna_brand: clientObj.warna_brand || clientObj['Warna Brand'] || '',
        branding_existing: clientObj.branding_existing || clientObj['Branding Existing'] || '',
        halaman_dibutuhkan: clientObj.halaman_dibutuhkan || clientObj['Halaman Dibutuhkan'] || '',
        fitur: clientObj.fitur || clientObj['Fitur'] || '',
      };

      built = buildPrompt(matches[0].code, client);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        matches: matches.map(m => ({
          code: m.code,
          title: m.title,
          mesin: m.mesin,
          designStyle: m.designStyle,
          score: m.score,
        })),
        built: built ? {
          templateCode: built.templateCode,
          templateTitle: built.templateTitle,
          mesin: built.mesin,
          designStyle: built.designStyle,
          pages: built.pages,
          prompt1: built.prompt1,
          dataProduk: built.dataProduk,
          linkedPrompts: built.linkedPrompts,
        } : null,
      }),
    };
  } catch (err) {
    console.error('match-template error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error', message: err.message }),
    };
  }
};
