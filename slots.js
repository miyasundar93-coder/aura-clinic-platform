const { adminClient, json, method } = require('./_supabase');
module.exports = async (req, res) => {
  if (!method(req, res, 'GET')) return;
  const clinic = String(req.query.clinic || '').trim();
  const date = String(req.query.date || '').trim();
  if (!clinic || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'clinic and date (YYYY-MM-DD) are required' });
  const db = adminClient();
  const { data, error } = await db.rpc('aura_public_slots', { p_clinic_slug: clinic, p_date: date });
  if (error) return json(res, 400, { error: error.message });
  return json(res, 200, { slots: data || [] });
};
