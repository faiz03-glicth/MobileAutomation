# Architecture

## Why a separate repository

```text
Application repository (-Ada / Streak)      MobileAutomation repository (this one)
        │                                            │
        ▼                                            ▼
   the mobile app  ◄──── drives, checks ──── end-to-end / UI automation
```

The app repo owns the product and its unit/component tests (Jest). This repo owns black-box tests of an
**installed build**, the way a person uses it. Keeping them apart means the tests are versioned, reviewed and
run on their own schedule, can test any build (EAS preview, store build, a colleague's APK) without the app's
source, and a second framework can be added here without touching the app. The only thing shared is the
app's **UI contract**: its test IDs and accessibility labels, recorded in
[test-data/ui-contract.json](../test-data/ui-contract.json).

## Layers

```text
Test requirements   test-cases/*.md               what must be true (framework-neutral)
        │
Test data           test-data/*.json              UI contract, accounts, inputs, audit tables (neutral)
        │
Framework           maestro/                      how it is checked today
        │             flows/       test cases (tagged with requirement IDs)
        │             screens/     per-screen assertions and actions
        │             components/  steps shared across screens (launch, back, tabs, dialogs, audit)
        │             config/      test data (generated) + run settings, timeouts, helpers
        │             scripts/     JavaScript that YAML can't express (email code from the OTP broker)
        │
Runner              tools/                        preflight, secrets, filtering, reports (Node, no deps)
        │
Device              adb (Wi-Fi or USB)            real phone or emulator
        │
Application         Streak build under test
```

A test case travels down the layers: `TC-HM-005` (requirement) → `flows/regression/TC-HM-005_…yaml`
(flow) → `screens/checkin/add_check_in.yaml`, `screens/home/open_heatmap.yaml` (screen steps) →
`components/common/start_as_guest.yaml`, `components/sheets/close_sheet.yaml` (components) → selectors from
`output.ids…` (test data) → Maestro → adb → the app.

## How Maestro is organised without page-object classes

Maestro flows are YAML, so modularity comes from:

- **Subflows** (`runFlow`) with parameters (`env`), for screens and components.
- **`output`**: one JavaScript object shared by a flow and all its subflows. `bootstrap.yaml` fills it
  before every flow (`onFlowStart`) with the test data (`output.ids`, `output.screens`, `output.labels`,
  `output.inputs`, `output.data.audit`), run settings (`output.env`, `output.timeouts`), today's date
  (`output.today`) and small helpers (`output.fill`, `output.step`, `output.homeHeader`, `output.literal`).
- **Tags** instead of suites-by-folder: `smoke`, `regression`, `navigation`, `interactive`, areas
  (`onboarding`, `auth`, `heatmap`…), requirement IDs (`TC-HM-005`) and capability needs
  (`requires-test-email`, `requires-otp-admin`).
- **Labels** on steps, phrased as expectations, which the report prints on failure.

`maestro/config/test-data.js` is generated from `test-data/*.json` (`tools/sync-test-data.mjs`) because
Maestro's JavaScript sandbox can't read files. The JSON stays the source of truth that another framework can
read directly; the generated file is committed so Maestro Studio and plain `maestro test` work too.

## The interaction audit

A generic engine (`components/audit/*`) walks a table from
[test-data/interaction-audit.json](../test-data/interaction-audit.json): each element must be visible and
enabled, respond to exactly one tap, show its expected destination, and let the person get back. Failures
are collected, not fatal, so one run reports every misbehaving control with a screenshot of each. Adding a
control to an audit is one JSON line; another framework can walk the same tables.

## The runner

`tools/run.mjs` exists so every run, local or CI, behaves the same:

- **Preflight:** Node/Java/Maestro/adb present, exactly one device (or `DEVICE_ID`), the app installed, and
  what build it is.
- **Configuration:** `.env` or real environment; non-secret values become Maestro `-e` parameters.
- **Secrets:** never given to Maestro (it logs every parameter). The OTP broker holds the Supabase key and
  exposes a one-run localhost URL instead; report files are scrubbed as a safety net.
- **Filtering:** flows whose accounts aren't configured, and interactive flows, are left out and listed.
- **Isolation and resilience:** each flow runs in its own Maestro session (a Wi-Fi session's on-device
  driver doesn't last more than a few minutes); the phone is health-checked and reconnected before each
  flow, and a flow that lost the device is re-run once. App failures are never retried.
- **Reports:** a folder per run with a `summary.md` that names, for each failure, the test cases, failing
  step, expected vs actual, screenshot, hierarchy and device log, plus device, app build, tools and
  environment; `run.json` and JUnit for CI.

It is plain Node (no dependencies), so it runs the same on Windows, macOS, Linux and CI images.

## Adding another framework later

Maestro is the current implementation, not the architecture. To add, say, Appium with WebdriverIO:

```text
MobileAutomation/
├── test-cases/        unchanged: the same requirements and IDs
├── test-data/         unchanged: read ui-contract.json, accounts.json, inputs.json, interaction-audit.json
├── maestro/           unchanged
├── appium/            new: its own package.json / pom.xml / pyproject, specs named after the same TC IDs
└── tools/             the runner gains an "appium" target that writes the same summary.md / run.json
```

Guidelines:

- Name tests after the requirement IDs and tag them the same way, so `test-cases/` traceability and
  `npm run check` extend naturally, and a requirement can be automated in either framework (or both, e.g.
  Maestro for the fast smoke, Appium for flows that need device APIs Maestro lacks).
- Load selectors from `test-data/ui-contract.json` rather than copying them (React Native `testID` is the
  Android `resource-id` / iOS `accessibilityIdentifier` in every framework).
- Reuse the OTP broker (`tools/lib/otp-broker.mjs`) for email sign-in; never give the key to the framework.
- Produce the same report shape so CI and people read results the same way.
- Create the new folder only when its first real test lands, with a README saying what it covers and why that
  framework was chosen.

No wrapper layer pretends Maestro and Appium are the same: each framework is idiomatic in its own folder, and
what they share is data and requirements, not code.
