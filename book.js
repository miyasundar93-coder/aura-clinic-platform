const { adminClient, json, method } = require('./_supabase');
module.exports = async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const b = req.body || {};
  const clinicSlug = String(b.clinic || '').trim();
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').replace(/\D/g,'');
  const serviceId = String(b.serviceId || '').trim();
  const slotId = String(b.slotId || '').trim();
  if (!clinicSlug || !name || phone.length < 10 || !serviceId || !slotId) return json(res,400,{error:'clinic, name, valid phone, serviceId and slotId are required'});
  const db = adminClient();
  const { data, error } = await db.rpc('aura_public_book_appointment', {
    p_clinic_slug: clinicSlug, p_name: name, p_phone: phone,
    p_service_id: serviceId, p_slot_id: slotId, p_note: String(b.note || '').slice(0,1000)
  });
  if (error) {
    const conflict = /slot_unavailable|slot_already_booked/i.test(error.message);
    return json(res, conflict ? 409 : 400, { error: conflict ? 'This slot is no longer available. Please choose another time.' : error.message });
  }
  return json(res,201,{ok:true,...data});
};
