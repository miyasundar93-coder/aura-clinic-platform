const { adminClient, json, method, slugify } = require('./_supabase');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const expected = process.env.AURA_ADMIN_SECRET;
  if (!expected || req.headers['x-aura-admin-secret'] !== expected) return json(res, 401, { error: 'Unauthorized' });

  const body = req.body || {};
  const clinicName = String(body.clinicName || '').trim();
  const ownerName = String(body.ownerName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const city = String(body.city || '').trim();
  const specialty = String(body.specialty || '').trim();
  const services = Array.isArray(body.services) ? body.services : [];
  if (!clinicName || !ownerName || !email || !phone) return json(res, 400, { error: 'clinicName, ownerName, email and phone are required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address' });

  const supabase = adminClient();
  const baseSlug = slugify(body.slug || clinicName);
  if (!baseSlug) return json(res, 400, { error: 'Clinic name cannot produce a valid URL slug' });
  const slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
  const temporaryPassword = crypto.randomBytes(18).toString('base64url') + 'A9!';
  let authUserId = null;
  let clinicId = null;
  try {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email, password: temporaryPassword, email_confirm: true,
      user_metadata: { full_name: ownerName, aura_role: 'clinic_owner' }
    });
    if (userError) throw userError;
    authUserId = userData.user.id;

    const { data: clinic, error: clinicError } = await supabase.from('clinics').insert({
      name: clinicName, slug, phone, email, address: city || null, status: 'active', timezone: body.timezone || 'Asia/Kolkata'
    }).select('id,name,slug').single();
    if (clinicError) throw clinicError;
    clinicId = clinic.id;

    const { error: membershipError } = await supabase.from('clinic_memberships').insert({ clinic_id: clinicId, user_id: authUserId, role: 'owner' });
    if (membershipError) throw membershipError;

    const serviceRows = services.map(s => ({ clinic_id: clinicId, name: String(s.name || '').trim(), duration_minutes: Number(s.duration_minutes || 30), price: Number(s.price || 0), is_active: s.is_active !== false })).filter(s => s.name);
    if (serviceRows.length) {
      const { error } = await supabase.from('clinic_services').insert(serviceRows);
      if (error) throw error;
    }
    const { error: daysError } = await supabase.from('clinic_working_days').insert([1,2,3,4,5,6].map(weekday => ({ clinic_id: clinicId, weekday, is_open: weekday !== 0 })));
    if (daysError) throw daysError;
    const slots = [];
    for (let hour = 9; hour <= 17; hour++) slots.push({ clinic_id: clinicId, start_time: `${String(hour).padStart(2,'0')}:00`, end_time: `${String(hour+1).padStart(2,'0')}:00`, is_active: true });
    const { error: slotError } = await supabase.from('clinic_time_slots').insert(slots);
    if (slotError) throw slotError;

    return json(res, 201, {
      ok: true,
      clinic: { id: clinicId, name: clinic.name, slug: clinic.slug },
      doctor: { email, temporaryPassword, loginUrl: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/doctor` },
      enquiryUrl: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/booking?clinic=${encodeURIComponent(slug)}`,
      notice: 'Credentials are returned once. Deliver them securely and require a password change after first login.'
    });
  } catch (error) {
    if (clinicId) await supabase.from('clinics').delete().eq('id', clinicId);
    if (authUserId) await supabase.auth.admin.deleteUser(authUserId);
    console.error('AURA onboarding failed:', error);
    return json(res, 500, { error: 'Clinic onboarding failed. No clinic account was retained.', detail: error.message });
  }
};
