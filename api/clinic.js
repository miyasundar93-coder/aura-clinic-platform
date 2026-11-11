const { adminClient, json, method } = require('./_supabase');
module.exports = async (req, res) => {
  if (!method(req, res, 'GET')) return;
  const slug = String(req.query.slug || '').trim();
  if (!slug) return json(res, 400, { error: 'slug is required' });
  const db = adminClient();
  const { data: clinic, error } = await db.from('clinics').select('id,name,slug,phone,address,timezone').eq('slug', slug).eq('status','active').maybeSingle();
  if (error) return json(res, 500, { error: error.message });
  if (!clinic) return json(res, 404, { error: 'Clinic not found or inactive' });
  const { data: services, error: serviceError } = await db.from('clinic_services').select('id,name,duration_minutes,price').eq('clinic_id', clinic.id).eq('is_active', true).order('name');
  if (serviceError) return json(res, 500, { error: serviceError.message });
  return json(res, 200, { clinic, services: services || [] });
};
