# SimpleChat setup checklist

## 1. Supabase project URL (critical)

In **Supabase → Project Settings → API**, copy the **Project URL**.

It must look like: `https://xxxxxxxx.supabase.co`

Open that URL in a browser or terminal. If DNS fails, the app cannot log in, chat, or call.

Put the URL and the **anon / publishable** key into `config.js`:

```js
window.SUPABASE_URL = "https://YOUR_REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_ANON_OR_PUBLISHABLE_KEY";
```

Never put the **service_role** key in the frontend.

## 2. SQL migrations (run in order)

In **Supabase → SQL Editor**, run these **once** (skip any you already applied successfully):

1. `supabase_chat.sql` — chats, search, hide/delete basics  
   If you see `cannot change return type of existing function`, run:
   `DROP FUNCTION IF EXISTS public.get_my_chats();` then re-run the file.
2. `supabase_reopen_chat.sql` — soft-delete + reopen when peer messages again
3. `supabase_delete_fix.sql` — membership leave policy (optional if reopen file already covers hide)
4. `supabase_video.sql` — `call_signals` table + Realtime for calls
5. `supabase_storage.sql` — avatar bucket policies
6. `supabase_auth.sql` — username → email helpers
7. `supabase_v3.sql` — only if README or comments say you need it

Also in **Database → Replication / Realtime**, ensure these tables are published:
- `messages`
- `call_signals`
- `conversation_members` (optional, for chat reopen)

## 3. Auth settings

- **Authentication → Providers → Email**: enable Email
- For testing, you may disable **Confirm email**
- **Providers → Google**: enable if you use Google login
- **URL configuration**: add redirect URL  
  `https://getquicker.github.io/chat/`

## 4. After deploy

1. Open https://getquicker.github.io/chat/
2. Hard refresh: Ctrl+Shift+R (or clear site data once)
3. Log in with email if username lookup fails until `supabase_auth.sql` is applied
4. Test message send/receive on two accounts
5. Test audio call, then video call (allow mic/camera)

## 5. Calls still black / no sound?

- Both users on HTTPS (GitHub Pages is fine)
- Allow camera and microphone
- Tap **Tap for sound** if the browser blocks autoplay
- Restrictive networks may need a private TURN server (openrelay is best-effort only)
