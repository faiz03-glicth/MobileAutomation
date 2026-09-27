# Test cases

What the app must do, written as requirements with expected behaviour, independent of any automation tool.
Maestro flows (and any framework added later) implement these; they don't define them.

| File | Area | IDs |
| --- | --- | --- |
| [onboarding.md](onboarding.md) | First launch, Welcome, Intensity, Setup | TC-ONB-001 … 007 |
| [authentication.md](authentication.md) | Login, Google, email code, guest, log out, session | TC-AUTH-001 … 008 |
| [heatmap.md](heatmap.md) | Home heatmap, the Heatmap screen, the heatmap wave | TC-HM-001 … 007 |
| [navigation.md](navigation.md) | Tab bar, back navigation, interaction audits | TC-NAV-001 … 004 |
| [backlog.md](backlog.md) | Requirements not automated yet | — |

## Format

```markdown
### TC-AREA-000 Short title
- **Requirement:** what the person needs, in product terms
- **Preconditions:** app state before the steps
- **Steps:** what the person does
- **Expected:** what must be true afterwards (behaviour, not just "screen visible")
- **Priority:** P1 (release-blocking) | P2 | P3 · **Suites:** smoke / regression / navigation / interactive
- **Automation:** automated | partial | planned | manual, and where (framework + file)
```

- IDs never change meaning and are never reused. A retired case stays, marked `retired`.
- A flow lists the cases it covers in its `tags` (e.g. `TC-HM-005`) and in `properties.testCases`, so
  `npm run test:tag -- TC-HM-005` runs exactly the automation for one requirement, and reports name the
  cases that failed.
- `npm run check` fails if a flow uses an ID that isn't defined here, or if a case says `automated` but no
  flow is tagged with it.

## Adding or changing a requirement

1. Write or edit the case here first (new ID = next number in the area).
2. Implement it: see [docs/adding-tests.md](../docs/adding-tests.md).
3. Tag the flow with the ID, set **Automation:** to `automated` with the file, run `npm run check`.
