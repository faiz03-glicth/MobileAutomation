# MobileAutomation

End-to-end mobile UI automation for the **Streak** app (Expo / React Native, Android package
`com.faiz.streak`). It drives a real installed build on a phone or emulator and checks that the app behaves
as required, not just that screens appear: onboarding, sign-in, Home, the Heatmap and its "wave" animation,
navigation and the clickability of every important control.

Automation technology today: **[Maestro](https://maestro.dev)**. The requirements, test data and runner are
framework-neutral, so Appium, Detox or native tools can be added beside it later
([docs/architecture.md](docs/architecture.md)).

## Why it's a separate repository

The app repository owns the product and its unit tests; this one owns black-box tests of installed builds.
They're versioned, reviewed and run independently, can test any build without the app's source, and can
grow other frameworks without touching the app. The one thing they share is the app's **UI contract**
(test IDs and accessibility labels) in [test-data/ui-contract.json](test-data/ui-contract.json).

## Quick start

Prerequisites: Node 20+, Java 17+, Android platform-tools (`adb`), Maestro CLI, and a phone with a standalone
Streak build ([docs/device-setup.md](docs/device-setup.md) walks through all of it).

```bash
cp .env.example .env
npm run doctor
npm run test:smoke
npm run test:regression
npm run report          # opens the HTML report of the last run
```

`doctor` checks the tools, the connected phone (over Wi-Fi via wireless debugging, or USB), the installed app
build and your `.env`. **Most flows wipe the app's data** (`clearState`): use a test phone or a separate
`com.faiz.streak.local` build ([why and how](docs/device-setup.md#4-install-the-app)).

## Running tests

| Run | Command |
| --- | --- |
| Smoke: launch → onboarding → login → Home → Heatmap | `npm run test:smoke` |
| Regression: every automated test case | `npm run test:regression` |
| Navigation and interaction audits | `npm run test:navigation` |
| Google sign-in (interactive) | `npm run test:google` |
| One flow | `npm run test:flow -- maestro/flows/regression/TC-HM-006_heatmap_wave.yaml` |
| One screen / area | `npm run test:tag -- heatmap` (or `onboarding`, `auth`, `navigation`, `interaction-audit`) |
| One requirement | `npm run test:tag -- TC-AUTH-006` |
| Debug a flow | `npm run test:debug -- <flow>` (add `--watch` to re-run on save) |
| See the current screen's elements | `npm run inspect` |
| Static checks, no device | `npm run check` |

Details and options: [docs/running-tests.md](docs/running-tests.md).

## What's covered

| Area | Test cases | Highlights |
| --- | --- | --- |
| Onboarding | [TC-ONB-001…007](test-cases/onboarding.md) | every page individually, Continue / Back / Android Back / swipe / Skip, Setup needs ≥ 1 activity, choices carried into the app |
| Authentication | [TC-AUTH-001…008](test-cases/authentication.md) | Google (interactive), dummy email account with real codes, email validation, wrong/incomplete codes, log out, session after restart |
| Heatmap | [TC-HM-001…007](test-cases/heatmap.md) | opens and renders, years/months, day drill-down, re-entry, a check-in fills it everywhere, the wave animation never blocks taps |
| Navigation | [TC-NAV-001…004](test-cases/navigation.md) | tab bar in any order, interaction audits of Home, Profile + settings, Heatmap |

19 Maestro flows: 2 smoke, 12 regression, 4 navigation, 1 interactive.

## How it's organised

```text
MobileAutomation/
├── test-cases/            requirements with expected behaviour (TC-ONB, TC-AUTH, TC-HM, TC-NAV), framework-neutral
├── test-data/             framework-neutral data
│   ├── ui-contract.json      the app's test IDs, screens and labels: change selectors here, in one place
│   ├── accounts.json         test accounts (no secrets)
│   ├── inputs.json           what the scenarios type and pick
│   └── interaction-audit.json  element → visible → one tap → expected result → way back
├── maestro/               the current implementation
│   ├── config.yaml           workspace: flows/** are tests; everything else is a subflow
│   ├── config/               test-data.js (generated from test-data/) and constants.js (settings, dates, helpers)
│   ├── components/           shared steps: launch, guest start, back, tabs, dialogs, sheets, login fields, audit engine
│   ├── screens/              per-screen assertions and actions (onboarding, login, home, heatmap, checkin, profile)
│   ├── flows/                smoke/, regression/, navigation/, interactive/ (named and tagged by test case)
│   └── scripts/              JavaScript steps (email code from the OTP broker)
├── tools/                 Node runner (no dependencies): preflight, secrets, filtering, reports, checks
├── reports/               generated per run, gitignored (see reports/README.md)
└── docs/                  setup, accounts, running, adding tests, troubleshooting, CI, Git, testability gaps
```

```text
Test case (test-cases/)  →  Flow (flows/)  →  Screen steps (screens/)  →  Components (components/)
      →  selectors from test-data/  →  Maestro  →  adb (Wi-Fi/USB)  →  device  →  Streak
```

More: [docs/architecture.md](docs/architecture.md).

## Test accounts

- **Guest:** no account; most flows use it.
- **Google:** a test account whose address stays private (`GOOGLE_TEST_ACCOUNT` in `.env`). Its password is never stored or typed. The flow starts Google sign-in
  and picks the account; a person finishes anything Google asks on the phone.
- **Dummy email account:** Streak has no passwords (email sign-in sends a 6-digit code), so the dummy account
  is `TEST_USER_EMAIL` plus a code minted per run from Supabase's admin API by a local broker that keeps the
  service_role key out of Maestro and its reports. Configure it in `.env` (never committed) or CI secrets.

See [docs/test-accounts.md](docs/test-accounts.md).

## Results and failure diagnostics

`npm run report` opens an **HTML report** of the last run in your browser: filter by Passed / Failed, by
category (smoke, regression, onboarding, auth, heatmap, navigation…) or by search; passed tests are green and
failed ones red; each failure shows the **YAML file and line it failed on**, with the code highlighted and the
chain of subflows that led there, next to its screenshot, expected vs actual, logs and the app build and
device used. The page is built only when you ask and deleted when the next test run starts
([docs/running-tests.md](docs/running-tests.md#reports)).

Every run also keeps `reports/runs/<date>_<time>_<suite>/` with `summary.md` (the same in text), `run.json`,
JUnit XML, raw Maestro artifacts and the full console log ([reports/README.md](reports/README.md)).

## Adding tests

Requirement first, then selectors in the contract, then reuse screens/components, then the flow, then the
audit table. Step by step: [docs/adding-tests.md](docs/adding-tests.md).

## Troubleshooting

Device not detected, app not installed, selector not found, taps ignored, animation timeouts, login
failures, configuration problems: [docs/troubleshooting.md](docs/troubleshooting.md). Findings about the
app's testability (missing test IDs, toasts invisible to accessibility, …):
[docs/testability-gaps.md](docs/testability-gaps.md).

## Git, CI/CD

- Branches, and publishing to both GitLab and GitHub: [docs/git-workflow.md](docs/git-workflow.md).
- CI plan (local phone vs CI emulator, pipeline outline, GitLab/GitHub templates): [docs/ci-cd.md](docs/ci-cd.md).
