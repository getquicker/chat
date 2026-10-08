# SimpleChat — Version 1

A simple free-to-start messaging app using:

- HTML/CSS/JavaScript
- GitHub Pages for hosting
- Supabase Auth
- Supabase PostgreSQL
- Supabase Realtime

## Version 1 features

- Sign up with username + email + password
- Login with username + password
- Login with email + password
- Search users by username
- Start one-to-one conversations
- Real-time text messages
- Message timestamps
- Responsive desktop/mobile layout
- Row Level Security (RLS)

Phone login is NOT included.

## 1. Create a Supabase project

Create a project at https://supabase.com/

Then open:

Authentication → Providers → Email

Enable Email authentication.

For testing, you can disable email confirmation so accounts can log in immediately. For a public app, keep confirmation enabled and configure proper SMTP later.

## 2. Create the database

In Supabase:

SQL Editor → New query

Paste the complete contents of `supabase.sql` and run it.

This creates the tables, security policies, username lookup functions, conversation function, and Realtime setup.

## 3. Get your Supabase keys

Open:

Project Settings → API

Copy:

- Project URL
- anon/public key (or the publishable browser key if your project exposes it)

NEVER put a `service_role` / secret key in this website.

## 4. Configure the website

Copy:

`config.js.example`

to:

`config.js`

Then edit `config.js`:

```js
window.SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_PUBLIC_KEY";
```

## 5. Test locally

Because browsers can behave differently when opening local HTML files, use a small local server.

If you have Python:

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

## 6. Put it on GitHub Pages

Create a GitHub repository.

Upload:

- index.html
- style.css
- app.js
- config.js
- supabase.sql
- README.md

Do NOT upload your `service_role` key. The `config.js` file is okay to publish only when it contains the public anon/publishable key.

In GitHub:

Settings → Pages → Deploy from branch → main → /(root)

Your app will receive a GitHub Pages URL.

## 7. Important security notes

The public browser key is designed to be exposed. Security comes from Supabase Auth + Row Level Security.

Never expose:

- Supabase service_role key
- database password
- private API keys

For a real public launch, add:

- email verification
- password reset
- rate limiting / abuse controls
- block/report users
- message deletion rules
- stronger profile validation
- proper SMTP
- privacy policy and terms

## Current limitations

Version 1 intentionally keeps the scope small:

- Text only
- One-to-one conversations
- No groups
- No file/image upload
- No push notifications
- No voice/video
- No message editing/deletion
- No typing indicator
- No advanced presence system

Those can be added in Version 2.
