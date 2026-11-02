# APEX Workspace Login Manager (Chrome Extension)

Saves Workspace / Username / Password per login URL and auto-fills them the next
time you visit that page. Built for Oracle APEX builder/workspace login pages,
but works on any page with a username + password (and optional workspace) field.

## Install (unpacked, for personal use)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads it live from disk).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `oracle-apex-login-manager` folder.
5. Pin the extension (puzzle-piece icon → pin) so it's easy to reach.
6. **Reload any APEX login tabs already open** — a fresh install only injects into new page loads.

## How it works

- Each login page is identified by its URL (origin + path, ignoring `?p=...` query
  parameters), so `.../ords/f?p=4550:1` on two different servers are treated as
  different pages, but different APEX apps at the same URL with different page
  numbers are treated as the same page — exactly matching how APEX workspace
  logins normally work (same login page, different workspace/user each time).
- On page load, the extension tries to auto-detect the workspace / username /
  password fields by their `id`/`name` (looks for things like `WORKSPACE`,
  `USERNAME`, and any `type="password"` field).
- If it finds **one** saved login for that page → it fills it in automatically.
- If it finds **more than one** → a small chooser appears top-right so you pick
  which one to fill.
- If it finds **none** → open the extension popup and add one manually, or use
  **Capture from page** after typing your credentials once.
- After you submit a login form the extension doesn't recognize yet, it will
  offer a small "Save this login?" prompt (top-right) so you don't have to open
  the popup at all.

## If auto-fill doesn't find the right boxes

Oracle APEX field IDs vary a bit between versions and between the builder login
vs. a custom app login page. Open the popup on that page, expand **Field
mapping (advanced)**, click **Pick** next to Workspace / Username / Password,
then click the matching box on the actual page. That mapping is remembered for
that exact login page from then on.

## Security note (please read)

Credentials are stored with `chrome.storage.local` — **plain text, local to
your Chrome profile, not encrypted, and not synced anywhere**. That's fine for
a personal convenience tool on your own machine, but:
- Don't use this on a shared/public computer.
- Anyone with access to your Chrome profile (or another extension with broad
  permissions) could in principle read these values.
- If you want real encryption-at-rest, that's a bigger project (master
  password + Web Crypto) — happy to add it if you want, just ask.

## Files

- `manifest.json` — extension config (Manifest V3)
- `content.js` / `content.css` — runs on pages, detects fields, autofills, shows the chooser/save prompt
- `popup.html` / `popup.js` / `popup.css` — the toolbar popup UI for managing saved logins
- `icons/` — extension icons
