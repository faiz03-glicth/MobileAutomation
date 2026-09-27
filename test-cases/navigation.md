# Navigation and interaction

The clickability audit catches the problems a "screen is visible" test misses: invisible overlays, wrong
layering, tap targets in the wrong place, animations or scroll containers swallowing touches, buttons that
need two taps, and buttons that go to the wrong place. Each audit is a table in
[test-data/interaction-audit.json](../test-data/interaction-audit.json):

```text
Element → expected visibility → expected interaction → expected result → way back
Profile avatar → visible, enabled → one tap (no retry) → Profile screen → Home tab
```

Every row is checked even when an earlier one fails, and the audit reports all failing rows at once with a
screenshot of each.

### TC-NAV-001 Tab bar
- **Requirement:** Every tab opens its screen with a single tap, from any other tab.
- **Preconditions:** Guest on Home.
- **Steps:** Tap Profile, Insights, History, Home, History, Profile, Insights, Home; tap Home again; open +
  from Home and from Profile and close it (Close button, Android Back).
- **Expected:** Each single tap shows the right screen and marks that tab selected (the selection indicator
  follows); re-tapping the current tab keeps it; + opens a check-in and closing it returns to the same tab.
- **Priority:** P1 · **Suites:** navigation, regression
- **Automation:** automated, Maestro `flows/navigation/TC-NAV-001_tab_bar.yaml`

### TC-NAV-002 Home interaction audit
- **Requirement:** Every control on Home works with one tap and leads where it says.
- **Preconditions:** Guest on Home, no check-ins.
- **Steps / expected:** the `home` table: Profile avatar → Profile; year title → Heatmap; this month → date
  wheel; Log your first check-in → check-in sheet; See all → History; + → check-in sheet.
- **Priority:** P1 · **Suites:** navigation, regression
- **Automation:** automated, Maestro `flows/navigation/TC-NAV-002_home_audit.yaml`

### TC-NAV-003 Profile and settings interaction audit
- **Requirement:** Every Profile row opens its settings screen with one tap, and both Backs return to Profile.
- **Preconditions:** Guest on Profile.
- **Steps / expected:** the `profile` table: Edit profile and Account settings → Account; Appearance;
  Notifications; Activity preferences; Data & privacy and Export data → Data & privacy; About Streak.
- **Priority:** P2 · **Suites:** navigation, regression
- **Automation:** automated, Maestro `flows/navigation/TC-NAV-003_profile_audit.yaml`

### TC-NAV-004 Heatmap interaction audit
- **Requirement:** Every Heatmap control works with one tap.
- **Preconditions:** Heatmap screen.
- **Steps / expected:** the `heatmap` table: Month view → today's tile; today's tile → day details; Year
  view → this month; this month → date wheel; Back → Home.
- **Priority:** P2 · **Suites:** navigation, regression
- **Automation:** automated, Maestro `flows/navigation/TC-NAV-004_heatmap_audit.yaml`
