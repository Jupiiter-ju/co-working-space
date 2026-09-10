# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A single-page booking system for a company's co-working space quota (15 slots/day, bookable up to 1 month ahead). There is no build step, no package manager, and no test suite — the entire frontend is `index.html` (HTML + Tailwind CDN + vanilla JS). It is deployed as a static site via GitHub Pages.

## Commands

There is nothing to install, build, lint, or test. To work on the frontend:

- Open `index.html` directly in a browser (`file://` works), or serve it with any static file server (e.g. `python -m http.server` / a one-off `node -e` static server) if `file://` restrictions get in the way of `fetch`.
- Verify JS changes parse before considering a change done:
  ```bash
  node -e "
  const fs = require('fs');
  const html = fs.readFileSync('index.html', 'utf8');
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(([, s], i) => {
    try { new Function(s); } catch(e) { console.log('Script block', i, 'ERROR:', e.message); }
  });
  "
  ```
- Deploy: push to `main`. GitHub Pages rebuilds `https://jupiiter-ju.github.io/co-working-space/` automatically from the repo root.

## Architecture

**Frontend (`index.html`) → Google Apps Script Web App → Google Sheet.** There is no database beyond the Sheet.

- The Apps Script backend is the source of truth for booking data, but **its code does not live reliably in this repo.** `Code.gs` here is a stale snapshot; the authoritative version is edited live in the Apps Script project bound to the Google Sheet (Sheet → Extensions → Apps Script). When asked to change backend behavior (account assignment, row writes, validation), the actual script must be opened and edited there — don't assume `Code.gs` reflects production, and update it here too when you do touch the live script so the two don't drift further.
- The Sheet has a `Booking` tab (one row per booking; columns include `id`, `name`, `team`, `date`, `accountNumber`, `status`, `teamOther`, and an n8n-managed `วันที่ทำรายการ` transaction-timestamp column) and an `AccountNumber` tab (`AccountNumber` / `Name` / `NicknameEN` / `NicknameTH` — the reference for who owns each of the 15 account numbers).
- `index.html` duplicates the account roster as hardcoded JS constants: `ACCOUNT_NUMBERS`, `ACCOUNT_NAMES`, `ACCOUNT_NICKNAMES`. These must be kept in sync **by hand** with the `AccountNumber` sheet tab whenever a number's owner or nickname changes — there is no live fetch from the sheet for this data.
- Account number assignment happens server-side (Apps Script, inside a `LockService` lock) to avoid race conditions when two people book at once. The frontend's account picker lets a user pick a specific number from those free that day (matched against `getAvailableAccountNumbers`), pre-selecting one via `findOwnerAccountNumber()` if the typed name matches a nickname or full name; the server re-validates the chosen number is still free before committing, and returns `{ success:false, error:'account_taken' }` if someone else grabbed it first, at which point the frontend reopens the picker.
- Booking flow has confirmed vs. waitlist states based on `MAX_SLOTS = 15` per day; waitlisted bookings get auto-promoted (and a fresh account number assigned) when a confirmed booking is cancelled.
- New rows must be written at `getLastDataRow(sheet) + 1` (last row with a non-empty `id`), never via `sheet.appendRow()` / `sheet.getLastRow()`. Google Sheets counts cells that only carry data-validation formatting (dropdowns) as "having content," so `getLastRow()` drifts upward over time and causes new bookings to be written dozens or hundreds of rows below the real data — this already happened once in production. Keep dropdown validation ranges reasonably close to the actual data for the same reason.
- **Apps Script deployments do not auto-update.** Saving the script editor only commits a new version in its history; the live Web App URL keeps serving whatever version it was last deployed with. After any backend change, you must explicitly create a new deployment version pointed at the *existing* deployment (Manage deployments → Edit → New version → Deploy) so the URL in `APPS_SCRIPT_URL` stays the same — never create a brand-new deployment for a fix, since that changes the URL.
- n8n workflow exports in this repo (`coworking-booking-bot.json`, `send-dm-intro-bot.json`, `n8n-cowork-email-workflow.json`) are point-in-time exports, not the live automations — editing them here has no effect on production n8n. `n8n-cowork-email-workflow.json`'s webhook (`N8N_WEBHOOK_URL` in `index.html`) is called only for new waitlist entries, to send a confirmation email; confirmed bookings never call out to n8n from the frontend or from Apps Script.

## Repo hygiene

- **This is a public repo.** `coworking-booking-bot.json` and `send-dm-intro-bot.json` contain live Discord bot credentials and must never be committed — they're intentionally left untracked (not gitignored, just never `git add`ed). Double-check `git status` before staging and stage files explicitly (`git add index.html`), never `git add -A` / `git add .`, in this repo.
- Numbered/loose image files at the repo root (screenshots, step-by-step guide images referenced from `index.html`'s guide modal) are content assets, not build output — don't delete them as "unused" without checking `index.html` for references first.
