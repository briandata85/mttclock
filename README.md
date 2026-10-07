# MTTClock

A browser-based poker tournament clock with director controls, display themes, saved tournaments, payouts, images, and spoken announcements.

## Standalone hosting

The frontend is static HTML/CSS/JavaScript. It does not require ChatGPT, Next.js, a paid web server, or a running personal computer. Accounts, storage, and tournament sync use Supabase. An internet connection is required.

1. Use Node.js 22 or newer. Run `npm ci` and `npm test`.
2. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the build environment. The latter must be a publishable key, never a service-role or secret key.
3. Run `npm run build`. Deploy only `dist/`.
4. On Cloudflare Pages: framework None, build `npm run build`, output `dist`, production branch `main`. Configure the two environment values above.
5. Add the exact deployed origin to the account function's CORS allowlist before enabling public signups. Never broaden it to arbitrary origins.

Routes: `/tournaments`, `/account`, `/login`, `/t/<id>/director`, `/t/<id>/display`. Director access requires the owner account; display access is controlled by the tournament settings.

## Backend

`cloud/` contains the existing Supabase Edge Functions and account SQL. This is a source export, not a one-command clean backend installer. The tournament/artwork schema must be migrated from the existing project or documented separately before provisioning a new project. Do not put service keys, passwords, user data, or database backups in this repository.

Existing accounts and tournaments remain in the existing Supabase project when hosting changes. Browser sessions are origin-specific: users sign in again on the new URL.

## Assets and licenses

No user-uploaded images or third-party poker logos are included. Roboto is covered by its included SIL Open Font License. Supabase's browser client is included in `public/cloud-auth.js`; see `THIRD_PARTY_NOTICES.md`. The alert chime is an original generated tone. Generated short voice cues are documented in `public/audio/SOURCES.md`.

No general open-source license has been selected yet. Public source visibility alone does not grant unrestricted redistribution rights.
