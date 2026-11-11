const { createClient } = require('@supabase/supabase-js');

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}
function method(req, res, expected) {
  if (req.method !== expected) { json(res, 405, { error: `Use ${expected}` }); return false; }
  return true;
}
function slugify(value) {
  return String(value || '').toLowerCase().trim().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
}
module.exports = { adminClient, json, method, slugify };
