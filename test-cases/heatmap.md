# Heatmap

The heatmap is the core of Streak: every check-in darkens its day. Home shows the last three months; the
Heatmap screen (Home's year title) shows a whole year or one month. The "wave" is the heatmap's animation:
cells reveal diagonal by diagonal, and holding the Welcome heatmap (or Login's logo mark) collapses it and
stacks it back up.

### TC-HM-001 Open the Heatmap
- **Requirement:** From Home, a person can open the full heatmap and it renders.
- **Preconditions:** Home.
- **Steps:** Tap the year title on Home's heatmap card.
- **Expected:** "Heatmap" opens in Year view on this year: totals, every month up to this one (this month
  tappable), Next year disabled, and the "How intensity works" guide reachable by scrolling.
- **Priority:** P1 · **Suites:** smoke, regression
- **Automation:** automated, Maestro `flows/smoke/SMK-01_guest_journey.yaml`,
  `flows/regression/TC-HM-002_heatmap_periods_and_reentry.yaml`

### TC-HM-002 Step through years and months
- **Requirement:** A person can look back in time, never past today, in Year or Month view.
- **Preconditions:** Heatmap screen.
- **Steps:** Previous year → Next year; Month view; Previous month → Next month.
- **Expected:** Titles follow (last year, this year, "<Month> <Year>"); Next is enabled only when behind today;
  Month view shows a tile for today.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-002_heatmap_periods_and_reentry.yaml`

### TC-HM-003 From the heatmap into a day
- **Requirement:** A person can open any past day from the heatmap.
- **Preconditions:** Heatmap screen.
- **Steps:** Year view: tap this month → Open on the date wheel → Close. Month view: tap today → Android Back.
- **Expected:** The date wheel, then the day's details (with its check-in count) open; closing either returns to
  a Heatmap that responds to the next tap immediately.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-003_day_drill_down.yaml`

### TC-HM-004 Back and re-entry
- **Requirement:** Leaving and re-opening the Heatmap behaves the same every time.
- **Preconditions:** Heatmap screen.
- **Steps:** Back; open and close it three more times.
- **Expected:** Back returns to Home; it always re-opens in Year view on this year.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-002_heatmap_periods_and_reentry.yaml`

### TC-HM-005 A check-in fills the heatmap
- **Requirement:** Logging activity shows up everywhere it should.
- **Preconditions:** Guest with no check-ins, on Home.
- **Steps:** + → pick Workout → Check in; open the Heatmap; Month view; today → add a second check-in.
- **Expected:** Home: this month "1 check-in", "Today, 1 check-in", This week 1, Day streak 1, empty message
  gone. Heatmap: year total 1, today's tile "1 check-in"; day details count 1 then 2; today's tile and Home
  say 2 afterwards.
- **Priority:** P1 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-005_check_in_fills_heatmap.yaml`

### TC-HM-006 The heatmap wave
- **Requirement:** The heatmap animation plays, settles and never gets in the way.
- **Preconditions:** Welcome, fresh install.
- **Steps:** Hold the Welcome heatmap; tap Get started while it rebuilds; hold Login's logo mark and tap
  Continue with email; come back; hold the heatmap twice in a row, then tap "I already have an account".
- **Expected:** The heatmap collapses and stacks back up (screenshots before, during, after); it is whole
  when it settles; every tap made during or right after the animation works first time.
- **Priority:** P2 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-006_heatmap_wave.yaml` (the look of the
  animation is screenshot evidence, not an assertion)

### TC-HM-007 Home's heatmap months
- **Requirement:** Home's heatmap moves through time a month at a step and never past this month.
- **Preconditions:** Home.
- **Steps:** Previous months twice, Next months twice.
- **Expected:** The range label and months shift by one each time; Next months is disabled at the latest
  months and enabled otherwise.
- **Priority:** P3 · **Suites:** regression
- **Automation:** automated, Maestro `flows/regression/TC-HM-007_home_heatmap_months.yaml`
