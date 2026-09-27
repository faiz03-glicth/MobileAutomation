# Adding tests

The order matters: requirement first, then the app contract, then reusable screen steps, then the flow.

## 1. Write the requirement

Add a case to the right file in [test-cases/](../test-cases) (next free ID in that area), with the expected
*behaviour*: what changes, where the person ends up, what stays disabled. Mark it `planned` until automated.

## 2. Look at the real screen

Get the app to that screen on the phone and run:

```bash
npm run inspect
```

It lists every element Maestro can see: test ID (`id:`), text, accessibility label, state (tap, DISABLED,
checked, selected) and bounds. Use, in this order:

1. **Test IDs** (React Native `testID`): stable across copy changes and translations.
2. **Accessibility labels or text, scoped to the screen** with `childOf: { id: <screen id> }`, when there is
   no test ID. Scoping avoids matching Android's own navigation bar ("Back", "Home") or a screen underneath.
3. Never coordinates or `index:`; they break with every layout change.

If something important has no test ID, add it to [testability-gaps.md](testability-gaps.md) and ask for one
in the app repo. Elements missing from `inspect` (toasts, decorative views) can't be asserted at all: record
screenshot evidence instead (`components/common/evidence.yaml`).

## 3. Put selectors and copy in the contract

Add the screen and its IDs/labels to [test-data/ui-contract.json](../test-data/ui-contract.json)
(`screens`, `ids`, `labels`), inputs to [inputs.json](../test-data/inputs.json), then:

```bash
npm run sync:test-data
```

This regenerates `maestro/config/test-data.js`, so flows use `${output.ids.<area>.<name>}`,
`${output.screens.<name>}` and `${output.labels.<area>.<name>}`. When the app renames something, this JSON is
the only place to change. Remember that Maestro matches `text`/`id` as **regular expressions**: escape
`? . ( ) +` in labels, and use `output.literal(value)` for values like email addresses.

## 4. Reuse or add screen steps

```text
maestro/
├── components/     reusable across screens: launch_fresh, start_as_guest, wait_for_screen, evidence,
│                   nav_back, go_to_tab, android_dialog, close_sheet, email_field, enter_code, audit/*
├── screens/<name>/ one folder per app screen:
│   ├── <name>.assert.yaml    what must be on the screen (the screen's contract)
│   └── <action>.yaml         what a person does there (open_heatmap, request_code, log_out…)
└── flows/<suite>/  test cases: compose screens and components, add the case-specific checks
```

Before writing steps, look for an existing component or screen file; don't copy blocks between flows. Pass
parameters with `runFlow: { file: …, env: { NAME: value } }` and document them at the top of the file.

Helpers that need JavaScript go into `maestro/config/constants.js` (they become `output.<name>`). YAML can't
hold `a ? b : c` or `{ key: value }` inside an unquoted `${…}`, and enum fields such as
`scrollUntilVisible.direction` can't be `${…}` at all, so keep expressions in flows to simple calls.

## 5. Write the flow

```yaml
# One line: what this proves.
appId: ${APP_ID}
name: 'TC-XXX-000 Short title'          # becomes a folder name: no < > : " / \ | ? *
tags:
  - regression                           # suite: smoke | regression | navigation | interactive
  - heatmap                              # area, for "run this screen"
  - TC-XXX-000                           # every test case it covers
properties:
  testCases: 'TC-XXX-000'
onFlowStart:
  - runFlow: ../../components/common/bootstrap.yaml
---
- runFlow: ../../components/common/start_as_guest.yaml   # every flow starts from a known state
- …
```

Rules of thumb:
- Each flow is independent: start with `launch_fresh.yaml` or `start_as_guest.yaml`.
- Wait for conditions (`extendedWaitUntil`, `wait_for_screen.yaml`, `waitForAnimationToEnd`), never sleep.
- Check behaviour, not just presence: enabled/disabled, checked/selected, counts that change, where Back goes.
- One tap must be enough: use `retryTapIfNoChange: false` on taps you are testing.
- Give expectations a `label: 'Expect: …'`; it is what the report prints when the step fails.
- Flows needing accounts get `requires-test-email` or `requires-otp-admin`; flows needing a person get
  `interactive`.

## 6. Add interactive elements to the audit

Any new button, row or card on an audited screen gets a row in
[test-data/interaction-audit.json](../test-data/interaction-audit.json): selector, expected destination and
the way back. A new screen that matters gets its own table and a `TC-NAV-…` flow that runs
`components/audit/audit_screen.yaml` with `AUDIT: <table>`.

## 7. Check and run

```bash
npm run check
npm run test:flow -- maestro/flows/<suite>/<file>.yaml
```

Then set the case's **Automation:** to `automated` with the file name.
