# Reports

Everything in this folder except this file is generated and gitignored. Each run of the runner writes one
folder; nothing is overwritten.

```text
reports/
├── runs/<date>_<time>_<suite>/
│   ├── summary.md        ← start here: results, and for each failure the test cases, failing step, expected
│   │                       vs actual, screenshot, hierarchy and device-log links, the app's JS/crash log
│   │                       lines, plus device, app build, tools and environment
│   ├── run.json          ← the same, machine-readable (dashboards, CI annotations)
│   ├── junit/NN.xml      ← JUnit XML per flow, for CI test reports (html/NN.html with --html)
│   ├── maestro/NN/       ← raw Maestro artifacts of flow NN (every flow runs in its own Maestro session):
│   │   └── <time>/<flow name>/
│   │       ├── commands.json        every step with status, timing and errors
│   │       ├── screenshots/         the screen at the failing step
│   │       ├── screen-hierarchy/    the view tree at the failing step (what Maestro could "see")
│   │       ├── takeScreenshot/      evidence screenshots the flow took on purpose
│   │       └── logs/                device logcat and maestro.log for that flow
│   ├── maestro/NN-retry/, junit/NN-retry.xml
│   │                     ← only when the phone connection dropped during flow NN: its second attempt
│   ├── debug/NN/         ← Maestro's debug output per flow
│   └── logs/
│       ├── console.log   ← every Maestro command line and its full output
│       └── crash.txt     ← Android crash buffer entries logged during the run (only if any)
└── hierarchy/<time>.json ← dumps from `npm run inspect`
```

Mapping to the usual layout: **results** = `summary.md`, `run.json`, `junit/`; **screenshots** =
`maestro/**/screenshots` and `maestro/**/takeScreenshot`; **logs** = `logs/` and `maestro/**/logs`.

Print the latest summary with `npm run report`. Delete old runs whenever you like.
Secrets are never passed to Maestro; as a safety net the runner also scrubs known secret values from every
text file in a run folder before it finishes.
