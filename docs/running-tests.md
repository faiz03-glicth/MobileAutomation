# Running tests

Always run through the npm scripts (they wrap `tools/run.mjs`): they check the device and app first, pass
the configuration to Maestro, keep secrets out of Maestro, leave out flows that can't run with the current
configuration (and say so), and write a report for every run.

| What | Command |
| --- | --- |
| Check the setup | `npm run doctor` |
| **Smoke** (fast, ~2 min) | `npm run test:smoke` |
| **Regression** (everything automated, ~15-20 min) | `npm run test:regression` |
| Navigation / interaction audits only | `npm run test:navigation` |
| Google sign-in (interactive, keep the phone at hand) | `npm run test:google` |
| Every non-interactive flow | `npm run test:all` |
| **One flow** | `npm run test:flow -- maestro/flows/regression/TC-HM-005_check_in_fills_heatmap.yaml` |
| A folder of flows | `npm run test:flow -- maestro/flows/navigation` |
| **One screen / area** | `npm run test:tag -- heatmap` (tags: `onboarding`, `auth`, `heatmap`, `navigation`, `interaction-audit`) |
| One requirement | `npm run test:tag -- TC-HM-005` |
| Several tags (any of them) | `npm run test:tag -- onboarding,heatmap` |
| **Debug** one flow | `npm run test:debug -- maestro/flows/regression/TC-HM-006_heatmap_wave.yaml` |
| Re-run a flow on every save | `npm run test:flow -- <file> --watch` |
| What's on the phone's screen now | `npm run inspect` (`-- --all` includes system UI) |
| Build selectors interactively | `npm run studio` |
| Latest run's summary | `npm run report` |
| Static checks (no device) | `npm run check` (`-- --maestro` adds Maestro's syntax check of every file) |

Options (after `--`): `--device <serial>`, `--debug`, `--interactive`, `--exclude-tags a,b`, `--html`
(Maestro's detailed HTML report instead of JUnit), `-e KEY=VALUE` (e.g. `-e TIMEOUT_SCALE=1.5`,
`-e TODAY=2026-09-27`).

## Suites and tags

Suites are tag filters over `maestro/flows/**`:

| Suite | Tag | Contents |
| --- | --- | --- |
| smoke | `smoke` | `SMK-01` guest journey, `SMK-02` email journey |
| regression | `regression` | every automated test case, including the navigation flows and `SMK-02` |
| navigation | `navigation` | tab bar, back navigation, interaction audits |
| google | `google` | Google sign-in (tagged `interactive`) |

Left out automatically, and listed under "Not run" in the summary:
- `interactive` flows, unless the suite is `google` or you pass `--interactive`;
- `requires-test-email` without `TEST_USER_EMAIL`;
- `requires-otp-admin` without `TEST_USER_EMAIL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

A single flow file always runs; if it needs something missing it fails at once and says what.

Preview a selection without touching the phone: add `--list` (e.g. `npm run test:regression -- --list`).

## One Maestro session per flow, and the phone connection

The runner starts a separate Maestro session for every flow. Over wireless debugging, a Maestro session's
on-device driver was cut after about 4 to 5 minutes on the test phone (vivo V2169, 2026-09-27), and once it
is gone Maestro fails every remaining flow of that session within seconds. Short, separate sessions avoid
that, and one broken flow can't break the next.

Before each flow the runner checks the phone answers (reconnecting a dropped Wi-Fi link if needed). If a flow
still fails because the device or Maestro's driver became unavailable, it reconnects and runs that flow once
more; the summary shows it as "attempt 2, re-run after: …". Real test failures are never retried, so a flaky
*app* still shows up red.

## Debug mode

`npm run test:debug -- <flow>` runs one flow with Maestro's verbose logging and shows its full output
(including the noise the runner normally hides). Then:

1. Open `reports/runs/<run>/summary.md`: failing step, expected vs actual, screenshot at the failure.
2. Open the failure's `screen-hierarchy` JSON (linked in the summary) to see exactly what Maestro could see:
   an element missing there is invisible to automation even if it is on the screenshot (toasts, for example).
3. `npm run inspect` on the live screen, and `npm run studio` to try selectors against it.
4. `--watch` re-runs the flow each time you save it.

Labels on steps (`label: 'Expect: …'`) are what the console and the summary show, so a failure reads as the
requirement that broke.

## Running Maestro directly

For quick experiments you can call Maestro yourself, but pass the app ID (every flow reads it):

```bash
maestro test -e APP_ID=com.faiz.streak maestro/flows/smoke/SMK-01_guest_journey.yaml
```

Direct runs get no preflight, no report folder, no OTP broker (email sign-in fails) and no tag filtering.

## Reports

See [../reports/README.md](../reports/README.md). Every run: `reports/runs/<date>_<time>_<suite>/` with
`summary.md`, `run.json`, `junit.xml`, per-flow screenshots, hierarchies and device logs, and the console and
crash logs. The runner exits non-zero when anything failed, so CI marks the job red.
