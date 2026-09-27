# Authentication

Streak signs people in with Google, Apple (iOS only) or an emailed 6-digit code; there are no passwords.
Guests can use the app without an account. Test accounts: [docs/test-accounts.md](../docs/test-accounts.md).

### TC-AUTH-001 Google sign-in
- **Requirement:** A person can sign in with their Google account.
- **Preconditions:** Fresh install; the Google test account (`GOOGLE_TEST_ACCOUNT` in .env) is added to the phone.
- **Steps:** I already have an account → Continue with Google → pick the account → finish Google's prompts.
- **Expected:** Google's account chooser opens (the button shows "Connecting…" meanwhile); after Google
  finishes, Home opens and Profile shows the Google account's email. The password is never stored or typed
  by automation; any Google prompt is completed by a person.
- **Priority:** P1 · **Suites:** interactive
- **Automation:** automated, Maestro `flows/interactive/TC-AUTH-001_google_sign_in.yaml` (interactive)

### TC-AUTH-002 Email sign-in with the dummy account
- **Requirement:** A person can sign in with an emailed code.
- **Preconditions:** Fresh install; TEST_USER_EMAIL and the Supabase admin settings configured.
- **Steps:** I already have an account → Continue with email → type the address → Send code → type the code.
- **Expected:** "Check your inbox" names the address; a valid code opens Home; Profile shows the address.
- **Priority:** P1 · **Suites:** smoke, regression (needs `requires-otp-admin`)
- **Automation:** automated, Maestro `flows/smoke/SMK-02_email_journey.yaml`

### TC-AUTH-003 Email address validation
- **Requirement:** Only a valid address can request a code.
- **Preconditions:** Login → Continue with email.
- **Steps:** Leave empty; type `not-an-email`, `person@`, `person@example`; type `person@example.com` and
  `Person@Example.COM`.
- **Expected:** Send code stays disabled for empty and invalid input and is enabled for both valid forms.
  (Surrounding spaces are also accepted by the app, but a keyboard like Gboard rewrites typed spaces, so
  that case belongs in the app's unit tests.)
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-AUTH-003_email_validation.yaml`

### TC-AUTH-004 Code step errors
- **Requirement:** Mistakes on the code step are explained and recoverable.
- **Preconditions:** A code was requested for TEST_USER_EMAIL (sends one real email).
- **Steps:** Look at Resend; type 5 digits; type a wrong 6-digit code; Use a different email.
- **Expected:** Resend is disabled with its countdown; 5 digits submit nothing; a wrong code shows "That code
  is wrong or has expired…" and keeps the person on the code step, signed out; Use a different email returns
  to the email step.
- **Priority:** P2 · **Suites:** regression (needs `requires-test-email`)
- **Automation:** automated, Maestro `flows/regression/TC-AUTH-004_email_code_errors.yaml`

### TC-AUTH-005 Login screen variants and Back
- **Requirement:** Login shows the right options for new and returning people, and Back always goes one step.
- **Preconditions:** Welcome.
- **Steps:** Open both variants; go to the email step and back with the on-screen Back and Android Back.
- **Expected:** Both variants show the logo, Continue with Google, Continue with email, Terms and Privacy
  Policy and Back; only the new-account variant has Skip. Back goes email step → options → Welcome.
- **Priority:** P2 · **Suites:** smoke, regression
- **Automation:** automated, Maestro `flows/smoke/SMK-01_guest_journey.yaml`,
  `flows/regression/TC-ONB-001_welcome_and_login_entry.yaml`, `flows/regression/TC-AUTH-003_email_validation.yaml`

### TC-AUTH-006 Log out
- **Requirement:** Logging out is confirmed first and leads back to sign-in.
- **Preconditions:** Signed in (guest is enough), on Profile.
- **Steps:** Log out → Cancel; Log out → Log out.
- **Expected:** A "Log out?" dialog; Cancel keeps the person on Profile; confirming opens "Welcome back"
  without Skip, and Back from there reaches Welcome.
- **Priority:** P1 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-AUTH-006_log_out.yaml`

### TC-AUTH-007 Session survives a restart
- **Requirement:** People don't have to go through onboarding or sign in again after closing the app.
- **Preconditions:** Guest on Home.
- **Steps:** Kill the app and open it again.
- **Expected:** Home opens directly; onboarding is not shown.
- **Priority:** P1 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-006_skip_to_home_and_stay.yaml`

### TC-AUTH-008 Loading states
- **Requirement:** While a sign-in step is in progress the person sees it and can't start another.
- **Preconditions:** Login.
- **Steps:** Send code; enter a code; Continue with Google.
- **Expected:** "Sending…", "Verifying…" and "Connecting…" appear while waiting and other options are disabled.
- **Priority:** P3 · **Suites:** regression
- **Automation:** partial, screenshot evidence in the email and Google flows. The states last well under a
  second on a good network; asserting them reliably needs a throttled network (planned for CI emulators).
