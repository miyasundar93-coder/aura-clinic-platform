# AURA — Vercel + Supabase deployment starter

This ZIP packages the three supplied AURA HTML prototypes plus a Vercel serverless API foundation for secure Supabase-backed onboarding and public appointment booking.

## Important status

**This is a deployment starter, not a finished production clinic system.** The three original HTML files are preserved as prototypes and still use browser-local demo data. They are not yet wired to the new API or Supabase Auth. Do not use them to store real patient data until the dashboard and admin UI are migrated to authenticated API calls and tested.

The included backend provides:
- private clinic onboarding endpoint protected by `AURA_ADMIN_SECRET`;
- Supabase Auth doctor/owner account creation and clinic membership;
- clinic-specific enquiry URL generation;
- public clinic/service lookup;
- clinic-specific slot generation from working-day and time-slot settings;
- atomic booking RPC that reuses a patient by normalized mobile number and classifies repeat patients as follow-ups.

WhatsApp delivery, dashboard authentication wiring, first-login password reset UX, audit logs, rate limiting/CAPTCHA, and production monitoring still need implementation before real-world launch.

## 1. Deploy to Vercel

1. Extract this ZIP.
2. Create a GitHub repository and upload the extracted project files.
3. In Vercel, choose **Add New → Project** and import that repository.
4. Keep the root directory as `.`. Vercel will serve the root `index.html`, the named HTML pages, and the `/api` serverless functions.
5. Add the environment variables listed in `.env.example` under Vercel → Project → Settings → Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (reserved for the future browser-authenticated UI)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never put this in HTML or client JavaScript)
   - `AURA_ADMIN_SECRET` (a long random secret)
6. Redeploy after adding environment variables.

The prototype pages will be available at `/admin`, `/doctor`, and `/booking`. They are explicitly prototypes and are not connected to Supabase yet.

## 2. Add the booking functions to the Supabase database

The 11 base tables were already created in the user's Supabase project. Run `sql/002_public_booking_functions.sql` in Supabase → SQL Editor. This adds two server-only RPC functions used by `/api/slots` and `/api/book`.

Do not rerun the original table-creation SQL. This migration assumes those 11 tables and the composite constraints from the successful setup are present.

## 3. Verify API deployment

Open:

- `https://YOUR-VERCEL-DOMAIN/api/health`

Expected: JSON with `ok: true` and `configured: true` after environment variables are set.

## 4. Secure clinic onboarding API

Send a POST request to `/api/onboard` with the `x-aura-admin-secret` header. Example body:

```json
{
  "clinicName": "Example Dental Clinic",
  "ownerName": "Dr Example",
  "email": "doctor@example.com",
  "phone": "9876543210",
  "city": "Chennai",
  "specialty": "Dental",
  "services": [
    { "name": "Consultation", "duration_minutes": 30, "price": 500 },
    { "name": "Cleaning", "duration_minutes": 60, "price": 1200 }
  ]
}
```

The response includes the one-time temporary password, doctor login URL, and clinic-specific enquiry URL. Treat the response as sensitive. Do not log it or send credentials over an insecure channel. Require the doctor to change the password at first sign-in before production use.

## 5. Public API examples

Clinic details and active services:

`GET /api/clinic?slug=example-dental-clinic-xxxxxx`

Available slots for a date (generated from active working days and hourly slots):

`GET /api/slots?clinic=example-dental-clinic-xxxxxx&date=2026-12-01`

Book an available slot:

```json
POST /api/book
{
  "clinic": "example-dental-clinic-xxxxxx",
  "name": "Patient Name",
  "phone": "9876543210",
  "serviceId": "SERVICE_UUID",
  "slotId": "SLOT_UUID",
  "note": "Optional note"
}
```

The booking function locks the slot during booking, rejects a second booking for the same slot, and matches an existing patient by clinic + normalized phone number.

## 6. Before using real clinics/patients

- Replace the localStorage admin and doctor prototypes with Supabase Auth sessions and authenticated data queries.
- Add a secure admin login/role; do not expose the onboarding secret in browser code.
- Add first-login password change and password recovery.
- Add server-side validation, rate limiting, CAPTCHA/abuse protection, consent/privacy notices, audit logging and backups.
- Test with two clinics to prove tenant isolation.
- Test concurrent booking attempts, cancellation/rescheduling, time zones, daylight-saving zones where relevant, and duplicate mobile formats.
- Implement a scheduled WhatsApp worker/provider integration with retry and delivery status. A WhatsApp `wa.me` link is not automatic scheduled delivery.
- Review applicable patient-data privacy and healthcare regulations before onboarding real clinics.

## Project layout

- `public/admin-prototype.html` — supplied AURA network admin UI
- `public/doctor-prototype.html` — supplied doctor dashboard UI
- `public/booking-prototype.html` — supplied patient booking UI
- `api/` — Vercel serverless API routes
- `sql/002_public_booking_functions.sql` — additional booking RPC functions
- `.env.example` — environment variable names only; no secrets
