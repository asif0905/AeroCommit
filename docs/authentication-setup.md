# AeroCommit authentication setup

The public site supports Supabase Auth email/password signup and sign-in, password recovery, and optional Google OAuth. The configured Supabase project handles authentication. No mock accounts or planner-data cloud storage are implemented.

1. Create or select the owner's Supabase project.
2. Set Auth > URL Configuration > Site URL to `https://www.aerocommit.com/` and allow that exact redirect URL.
3. Enable Email authentication and configure production SMTP and appropriate rate limits before launch. Review signup availability and the provider's email templates.
4. Enter the project URL and **publishable key** (or legacy anon key) into `dist/auth-config.js`. These are public browser configuration. Never use a secret/service-role key.
5. For Google, configure its client ID/secret inside Supabase, allow the Supabase callback URL in Google's console, then set `googleEnabled: true`.
6. Deploy. Test creating an account, confirming email, password sign-in, password reset in the same browser, session restoration, sign-out, expired-link handling, and optional Google login. Users who previously registered using a magic link can use Forgot password to set a password.

The frontend uses the pinned official Supabase JS SDK through jsDelivr, PKCE and managed session refresh. Any future private database/storage access must enforce authorization with server validation or Supabase RLS. Browser UI visibility alone is not an authorization boundary. Signing in does not sync planning scenarios.

## Google and Microsoft OAuth
Both sign-in and sign-up show branded provider choices. The app checks Supabase public provider settings before starting OAuth; disabled providers show a setup message and email authentication stays available. No provider secrets belong in this repository.

To activate, configure Google and Azure (Microsoft) under Supabase Authentication → Sign In / Providers using client IDs and secrets from Google Cloud and Microsoft Entra app registrations. Use this Web callback in both registrations:
`https://dyrdftreyjsrlvpfufjk.supabase.co/auth/v1/callback`

Allow `https://www.aerocommit.com/` in Supabase redirect URLs. Google should allow the website origin `https://www.aerocommit.com`. For Microsoft choose the intended supported account types; the app requests the required email scope. Enable each provider after saving credentials, then test with a real account. The browser discovers enabled providers automatically without another deployment.
