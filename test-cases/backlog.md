# Backlog: requirements not automated yet

Candidates for the next phase, roughly in priority order. Give each a real ID in its area file when work
starts.

| Area | Requirement | Notes |
| --- | --- | --- |
| Check-ins | Edit and delete a check-in (with Undo) from History and Day details | History rows expose "Options for …" labels |
| Insights | Week / Month / Year ranges change the totals and charts | `insights-range-*` segment IDs exist |
| History | Search and activity filter narrow the list | `history-search`, `history-filter` |
| Settings | Appearance (theme, palette, week start, reduce motion) changes apply immediately | `appearance-*` IDs |
| Settings | Activity preferences: daily goal +/− and custom activities | `daily-goal`, Increase/Decrease labels |
| Privacy | Export CSV/JSON and "Delete all data" confirmation | Export opens the share sheet (system UI) |
| Auth | Apple sign-in | iOS only; needs an iOS runner |
| Platform | The same suites on iOS | Selectors are shared test IDs; Android-dialog steps need an iOS twin |
| Toasts | Assert toast text ("You're all set", "Signed out", Undo) | Blocked: toasts aren't in the accessibility tree (docs/testability-gaps.md) |
| Loading | Deterministic "Sending…/Verifying…" checks | Needs network throttling (CI emulator) |
