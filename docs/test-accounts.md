# Test accounts

| Account | Used by | Secrets | Where they live |
| --- | --- | --- | --- |
| **Guest** (no account) | almost every flow | none | — |
| **Google test account** (`GOOGLE_TEST_ACCOUNT`) | `TC-AUTH-001` (interactive) | its address (kept private) and password (**never stored or typed by automation**) | address: `.env` only; password: on the phone only |
| **Dummy email account** | `SMK-02`, `TC-AUTH-004` | a sign-in code per run, minted with the Supabase service_role key | `.env` (local) or CI secret variables |

Committed, non-secret descriptions of these accounts: [test-data/accounts.json](../test-data/accounts.json).

## Guest

Skip on Welcome or on the Login screen. Check-ins stay on the device. Nothing to configure.

## Google (interactive)

Google sign-in can't be fully automated without bypassing Google's security, and this project doesn't try.

1. Put the account's address in `.env` as `GOOGLE_TEST_ACCOUNT` (it stays out of Git; in CI it would be a
   masked variable). No committed file names the account, and `npm run check` fails if a real email address
   appears in one.
2. Add the account to the test phone once: Settings → Accounts → Add account → Google. Google's password
   and any 2-step prompts are entered by a person, on the phone.
3. Run `npm run test:google` and keep the phone in reach.

The flow opens Login, taps **Continue with Google**, taps the account in Google's account chooser
(`GOOGLE_AUTO_PICK=true`; set it to `false` to leave that to the person too), then waits up to
`HUMAN_TIMEOUT_MS` (default 3 minutes) for Home. Whatever Google shows in between (consent, password,
verification) is for the person holding the phone. The rest of the test (Home, Profile shows the account)
continues automatically. Interactive flows are left out of every other suite so unattended runs never hang.

If the chooser never appears, or the app shows "Something went wrong", check the Google Cloud Android
OAuth client: its package and the build's signing SHA-1 must match the installed build (app repo:
`docs/SETUP.md` §3).

## Dummy email account

Streak has **no passwords**: email sign-in sends a 6-digit code (Supabase email OTP). So there is no
`TEST_USER_PASSWORD`. The dummy account is an email address plus a way to get a valid code without reading
an inbox.

### Configure

In `.env` (copy of [`.env.example`](../.env.example), gitignored):

```dotenv
TEST_USER_EMAIL=streak.e2e+01@yourdomain.test
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Project Settings → API>
```

- Use an address you control and use only for tests. The account is created on its first sign-in.
- Prefer a separate Supabase project (staging) for tests. The service_role key bypasses Row Level Security:
  keep it out of the app, out of Git and out of chat; rotate it if it ever leaks.

With only `TEST_USER_EMAIL` set, `TC-AUTH-004` (code-step errors) runs; `SMK-02` (full sign-in) also needs
the two Supabase values. Without them those flows are left out and the run summary says so.

### How the code is obtained (and why the key never reaches Maestro)

Maestro records every `-e` parameter and every `MAESTRO_*` environment variable in its report files, so the
key can't be handed to Maestro. Instead:

1. The runner (`tools/run.mjs`) starts an **OTP broker** on `127.0.0.1` at a random, unguessable path that
   exists only for that run (`tools/lib/otp-broker.mjs`), and gives Maestro only that URL.
2. The flow requests a code in the app (the app emails one, as for a real person).
3. `maestro/scripts/email-code.js` asks the broker for a code. The broker calls Supabase Auth's admin API
   `POST /auth/v1/admin/generate_link` (`type: magiclink`) with the key and returns the `email_otp`, a valid
   code for that address (no second email is sent). It only issues codes for `TEST_USER_EMAIL`.
4. The flow types the code and continues to Home.

As a safety net, the runner also scrubs the key's value from every text file in the run's report folder.

### Email rate limits

Every run of `SMK-02` or `TC-AUTH-004` makes the app send one real email. Supabase's built-in email service
allows only a few emails per hour; beyond that the app shows an error banner and the flow fails with the
banner's text ("Sending the code failed, the app says: …"). For regular runs configure custom SMTP (or
raise the limits) on the test project: Supabase → Authentication → Emails / Rate Limits.

## In CI

Set the same names as masked, protected CI variables: `TEST_USER_EMAIL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (and `APP_ID` if not the default). Real environment variables override `.env`.
Google sign-in stays a local, interactive test.
