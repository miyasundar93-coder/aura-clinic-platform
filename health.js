const { json, method } = require('./_supabase');
module.exports = (req, res) => {
  if (!method(req, res, 'GET')) return;
  json(res, 200, { ok: true, service: 'AURA API', configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) });
};
