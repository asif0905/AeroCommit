# AeroCommit authentication setup

The public site supports Supabase Auth email magic links and optional Google OAuth. Authentication is inactive until a Supabase project is connected. No mock accounts or planner-data cloud storage are implemented.

1. Create or select the owner's Supabase project.
2. Set Auth > URL Configuration > Site URL to `https://www.aerocommit.com/` and allow that exact redirect URL.
3. Enable Email authentication and configure production SMTP and appropriate rate limits before launch. Review signup availability and the provider's email templates.
4. Enter the project URL and **publishable key** (or legacy anon key) into `dist/auth-config.js`. These are public browser configuration. Never use a secret/service-role key.
5. For Google, configure its client ID/secret inside Supabase, allow the Supabase callback URL in Google's console, then set `googleEnabled: true`.
6. Deploy. Test sending a magic link, completing the callback in the same browser, session restoration, sign-out, expired-link handling, and optional Google login.

The frontend uses the pinned official Supabase JS SDK through jsDelivr, PKCE and managed session refresh. Any future private database/storage access must enforce authorization with server validation or Supabase RLS. Browser UI visibility alone is not an authorization boundary. Signing in does not sync planning scenarios.
