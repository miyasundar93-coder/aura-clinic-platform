-- AURA public booking functions for the database schema already installed.
-- Run this AFTER the 11-table schema has been created.

CREATE OR REPLACE FUNCTION public.aura_public_slots(
  p_clinic_slug text,
  p_date date
)
RETURNS TABLE(slot_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_clinic public.clinics%ROWTYPE;
  v_weekday integer;
BEGIN
  SELECT * INTO v_clinic
  FROM public.clinics c
  WHERE c.slug = p_clinic_slug AND c.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'clinic_not_found';
  END IF;

  IF p_date < (now() AT TIME ZONE v_clinic.timezone)::date THEN
    RAISE EXCEPTION 'date_in_past';
  END IF;

  v_weekday := extract(dow FROM p_date)::integer;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_working_days d
    WHERE d.clinic_id = v_clinic.id
      AND d.weekday = v_weekday
      AND d.is_open = true
  ) THEN
    RETURN;
  END IF;

  -- Materialize the clinic's active recurring slots for this date.
  INSERT INTO public.appointment_slots
    (clinic_id, template_slot_id, slot_date, starts_at, ends_at, is_open)
  SELECT
    v_clinic.id,
    t.id,
    p_date,
    ((p_date + t.start_time) AT TIME ZONE v_clinic.timezone),
    ((p_date + t.end_time) AT TIME ZONE v_clinic.timezone),
    true
  FROM public.clinic_time_slots t
  WHERE t.clinic_id = v_clinic.id
    AND t.is_active = true
  ON CONFLICT (clinic_id, slot_date, starts_at) DO NOTHING;

  RETURN QUERY
  SELECT s.id, s.starts_at, s.ends_at
  FROM public.appointment_slots s
  WHERE s.clinic_id = v_clinic.id
    AND s.slot_date = p_date
    AND s.is_open = true
    AND s.starts_at > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.clinic_id = v_clinic.id
        AND a.slot_id = s.id
        AND a.status NOT IN ('cancelled', 'rescheduled')
    )
  ORDER BY s.starts_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aura_public_book_appointment(
  p_clinic_slug text,
  p_name text,
  p_phone text,
  p_service_id uuid,
  p_slot_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_clinic public.clinics%ROWTYPE;
  v_slot public.appointment_slots%ROWTYPE;
  v_service public.clinic_services%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_phone text;
  v_has_prior_appointment boolean;
  v_appointment_id uuid;
  v_type text;
  v_status text;
BEGIN
  SELECT * INTO v_clinic
  FROM public.clinics c
  WHERE c.slug = p_clinic_slug AND c.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'clinic_not_found'; END IF;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF length(trim(coalesce(p_name,''))) < 2 THEN
    RAISE EXCEPTION 'invalid_patient_name';
  END IF;

  SELECT * INTO v_service
  FROM public.clinic_services s
  WHERE s.id = p_service_id
    AND s.clinic_id = v_clinic.id
    AND s.is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_unavailable'; END IF;

  -- Lock the selected slot to serialize competing booking attempts.
  SELECT * INTO v_slot
  FROM public.appointment_slots s
  WHERE s.id = p_slot_id
    AND s.clinic_id = v_clinic.id
    AND s.is_open = true
  FOR UPDATE;
  IF NOT FOUND OR v_slot.starts_at <= now() THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = v_clinic.id
      AND a.slot_id = v_slot.id
      AND a.status NOT IN ('cancelled','rescheduled')
  ) THEN
    RAISE EXCEPTION 'slot_already_booked';
  END IF;

  -- Reuse the patient profile for this clinic; never create a duplicate.
  INSERT INTO public.patients
    (clinic_id, full_name, phone, normalized_phone)
  VALUES
    (v_clinic.id, trim(p_name), v_phone, v_phone)
  ON CONFLICT (clinic_id, normalized_phone)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    updated_at = now()
  RETURNING * INTO v_patient;

  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = v_clinic.id AND a.patient_id = v_patient.id
  ) INTO v_has_prior_appointment;

  IF v_has_prior_appointment THEN
    v_type := 'followup';
    v_status := 'followup';
  ELSE
    v_type := 'new';
    v_status := 'confirm';
  END IF;

  INSERT INTO public.appointments
    (clinic_id, patient_id, service_id, slot_id, appointment_type, status, notes)
  VALUES
    (v_clinic.id, v_patient.id, v_service.id, v_slot.id, v_type, v_status, nullif(trim(coalesce(p_note,'')),''))
  RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'appointmentId', v_appointment_id,
    'patientId', v_patient.id,
    'appointmentType', v_type,
    'status', v_status,
    'clinicName', v_clinic.name,
    'serviceName', v_service.name,
    'startsAt', v_slot.starts_at
  );
END;
$function$;

-- Only the backend service role should execute these public-facing routines.
REVOKE ALL ON FUNCTION public.aura_public_slots(text,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aura_public_book_appointment(text,text,text,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aura_public_slots(text,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.aura_public_book_appointment(text,text,text,uuid,uuid,text) TO service_role;
