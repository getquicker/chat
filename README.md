# SimpleChat

Private messaging with realtime chat and video calls.

**Stack:** HTML / CSS / JavaScript · GitHub Pages · Supabase Auth + Postgres + Realtime

## Features

- Sign up / log in with username or email
- Realtime one-to-one messaging
- Profile avatar and display name
- Audio & video calls
- Mobile-friendly Messenger-style UI
- PWA install support

## Setup

1. Create a project at [supabase.com](https://supabase.com)
2. **SQL Editor** → run `supabase_chat.sql` for the base chat schema, then apply only the additional migrations you need (`supabase_v3.sql`, `supabase_storage.sql`, `supabase_delete_fix.sql`, `supabase_reopen_chat.sql`, `supabase_video.sql`, `supabase_verified_badge.sql`). Run `supabase_verified_badge.sql` to enable verified-account badges. Do not rerun migrations blindly; read each file and run it only when its feature/schema change is needed.
3. **Project Settings → API** → copy **Project URL** and **anon / publishable** key
4. Edit `config.js`:

```js
window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_ANON_OR_PUBLISHABLE_KEY";
```

Never put the `service_role` key in this repo.

5. **Auth → Providers → Email**: for testing you can disable **Confirm email**
6. Host on GitHub Pages (or any static host)

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `app.js` | Loader for the client |
| `n0.txt`–`n4.txt` | App logic (compressed) |
| `style.css` / `extra.css` | UI |
| `config.js` | Supabase keys (public anon only) |
| `security.js` | Credential URL protection |
| `sw.js` | Service worker |
| `supabase_*.sql` | Database migrations |

## Security

- Only the anon/publishable key is used in the browser
- Passwords go to Supabase Auth over HTTPS (never in the URL)
- Keep Row Level Security (RLS) enabled on all tables
- Forms never submit with GET or leave credentials in the address bar

## Login tips

- Prefer **email + password** if username lookup fails
- If you see “Email not confirmed”, confirm the inbox link or disable confirmation in Supabase for testing
- If you see API key errors, re-copy the **anon** key from Project Settings → API into `config.js`
