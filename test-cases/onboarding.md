# Onboarding

### TC-ONB-001 Welcome on first launch
- **Requirement:** A first-time visitor sees what Streak is and can start, sign in or skip.
- **Preconditions:** Fresh install (no app data).
- **Steps:** Launch the app.
- **Expected:** The app launches without an error screen and opens Welcome: the hero heatmap, "See your
  consistency at a glance", "Step 1 of 3", enabled "Get started", "I already have an account" and Skip.
  No Back button on the first page.
- **Priority:** P1 · **Suites:** smoke, regression
- **Automation:** automated, Maestro `flows/smoke/SMK-01_guest_journey.yaml`,
  `flows/regression/TC-ONB-001_welcome_and_login_entry.yaml`

### TC-ONB-002 Welcome leads to both Login variants and back
- **Requirement:** New and returning people each reach the right sign-in screen, and can change their mind.
- **Preconditions:** Welcome.
- **Steps:** Get started → Back. I already have an account → Back.
- **Expected:** Get started opens "Create your Streak account" (with Skip); "I already have an account" opens
  "Welcome back" (no Skip). Back from either returns to Welcome, which still works.
- **Priority:** P1 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-001_welcome_and_login_entry.yaml`

### TC-ONB-003 Complete onboarding as a guest
- **Requirement:** Someone who doesn't want an account can still start tracking.
- **Preconditions:** Fresh install.
- **Steps:** Get started → Skip (on Login) → Continue (Intensity) → Start tracking (Setup).
- **Expected:** Intensity shows all five levels (No activity … Peak) and "Step 2 of 3"; Setup shows the six
  starter activities, the daily reminder and "Step 3 of 3", with no Skip; Start tracking opens Home with the
  empty heatmap. A "You're all set" confirmation appears (screenshot evidence: toasts are not in the
  accessibility tree, see docs/testability-gaps.md). Profile shows "Guest".
- **Priority:** P1 · **Suites:** smoke
- **Automation:** automated, Maestro `flows/smoke/SMK-01_guest_journey.yaml`

### TC-ONB-004 Move between onboarding pages
- **Requirement:** Every way of moving between pages moves exactly one page.
- **Preconditions:** Intensity page, as a guest.
- **Steps:** Continue → on-screen Back; Continue → Android Back; swipe left → swipe right.
- **Expected:** Each forward action lands on Setup, each back action on Intensity; Android Back never leaves
  onboarding from Setup. Setup never shows Skip.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-004_step_navigation.yaml`

### TC-ONB-005 Setup choices
- **Requirement:** Setup starts with sensible choices, needs at least one activity, and what is chosen is used.
- **Preconditions:** Setup page, fresh install.
- **Steps:** Check defaults; unpick every picked activity; pick Walk; flip the reminder twice; Start tracking;
  open a new check-in.
- **Expected:** Workout, Deep work and Reading picked and the reminder on by default. With nothing picked,
  Start tracking is disabled; picking one enables it. Each tap on an activity or the reminder flips it.
  The new check-in sheet offers the activity picked in Setup first.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-005_setup_choices.yaml`

### TC-ONB-006 Skip on Welcome
- **Requirement:** People can go straight into the app from the first screen.
- **Preconditions:** Fresh install.
- **Steps:** Skip on Welcome.
- **Expected:** Home opens (empty heatmap) as a guest; Profile shows "Guest".
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-006_skip_to_home_and_stay.yaml`

### TC-ONB-007 Skip on a middle page
- **Requirement:** Skip is available until the last page and finishes onboarding.
- **Preconditions:** Intensity page, as a guest.
- **Steps:** Skip.
- **Expected:** Home opens.
- **Priority:** P3 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-ONB-004_step_navigation.yaml`
