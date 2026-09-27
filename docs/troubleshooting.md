# Troubleshooting

Start with `npm run doctor`; it checks most of the setup below and says what to fix.

## Device not detected

- `adb devices -l` is empty: wireless debugging is off or the connection dropped (it does after a network
  change or restart, and the port changes). Phone: Developer options → Wireless debugging → on. Laptop:
  `adb mdns services`, then `adb connect <ip>:<port>` with the IP:port shown on the phone.
- `unauthorized`: accept the "Allow debugging?" prompt on the phone (tick "Always allow").
- `offline`: `adb disconnect`, then `adb connect <ip>:<port>` again; toggle Wireless debugging if needed.
- Listed twice (mDNS name and IP:port): harmless, the runner treats it as one phone. To be explicit, set
  `DEVICE_ID` in `.env` or pass `--device <serial>`.
- Several phones or emulators: set `DEVICE_ID`.
- **The connection drops mid-run** ("Device server died … StatusRuntimeException: UNAVAILABLE", then every
  later flow of that Maestro session fails within seconds). Seen on 2026-09-27 with the phone on battery
  over wireless debugging: the on-device driver was shut down 4 to 5 minutes into each session, and adb
  briefly showed the phone `offline`. Maestro can't recover inside a session, so the runner gives every flow
  its own short session, checks the phone answers before each one (reconnecting paired phones over mDNS),
  and re-runs a flow once if it still lost the device. The summary marks those "attempt 2, re-run after: …"
  and flags failures caused by the connection, not the app. To make drops rare:
  keep the phone charging with *Stay awake* on, turn off Wi-Fi power saving / "smart network switch", keep
  it close to the router, and don't run other adb tools that restart the adb server during a run. For long
  unattended runs a USB cable is still the most reliable link.

## Application not installed

`doctor` shows `App com.faiz.streak: not installed`. Install a standalone build
([device-setup.md](device-setup.md#4-install-the-app)) or point `APP_ID` at the package that is installed
(`adb shell pm list packages | grep streak`).

If the app opens on "Streak is missing its configuration", the build has no valid `EXPO_PUBLIC_*` values:
rebuild it with them (app repo `docs/SETUP.md` §5). If it opens on the Expo dev launcher, it is a
development build: use a preview/release build (dev builds forget Metro when `clearState` runs).

## Selector not found

"Element not found" or "Assertion is false: … is visible":

1. Open the failure screenshot and screen hierarchy linked in `summary.md`. If the element is on the
   screenshot but not in the hierarchy, automation can't see it (e.g. toasts): use evidence instead.
2. `npm run inspect` on that screen: did the test ID or label change in a new app build? Update it in
   [test-data/ui-contract.json](../test-data/ui-contract.json) and `npm run sync:test-data`.
3. Remember `text` and `id` are regular expressions: `Log out?` doesn't match "Log out?", `Log out\?` does.
   Emails and other values go through `output.literal(...)`.
4. Dates: heatmap IDs use the phone's date. If the laptop's date differs (time zone, just after midnight),
   pass `-e TODAY=YYYY-MM-DD`.
5. The element is lower on a scrolling screen: add `scrollUntilVisible` before asserting it.

## Tap not working

- **Nothing happens on any tap or typing:** on vivo/Xiaomi/OPPO enable *USB debugging (Security settings)* /
  *Disable permission monitoring* in Developer options. The phone must be unlocked.
- **A specific control ignores the tap:** something may be on top of it (an overlay, a toast, a sheet that
  didn't close, the keyboard). The screenshot shows it; `hideKeyboard` before tapping controls under the
  keyboard. That is exactly what the interaction audits catch: report it as an app bug.
- **Works only on the second tap:** flows under test use `retryTapIfNoChange: false` on purpose; a control
  that needs two taps is a real defect.
- **Taps land during a transition:** wait for the destination (`wait_for_screen.yaml`) and
  `waitForAnimationToEnd` before the next tap.

## Animation timeout

`waitForAnimationToEnd` or a wait times out on a slow phone or emulator: run with `-e TIMEOUT_SCALE=1.5` (or
set it in `.env`). If it fails even with long timeouts, the screen may never settle (an animation that
loops); check the evidence screenshots.

## Login failure

- **Email: "Sending the code failed, the app says: …"**: the app's error banner. Often Supabase's email rate
  limit; wait, or configure custom SMTP / higher limits on the test project
  ([test-accounts.md](test-accounts.md#email-rate-limits)).
- **"OTP broker running" failed**: `TEST_USER_EMAIL`, `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is
  missing, or you ran Maestro directly instead of through `npm run`.
- **"OTP broker failed (HTTP 502): Supabase answered HTTP 401/403"**: wrong service_role key or project URL.
- **Wrong code accepted/rejected unexpectedly**: the app and the key must point at the same Supabase project.
- **Google: chooser doesn't open / "Something went wrong"**: the build's signing SHA-1 isn't registered on the
  Google Cloud Android OAuth client, or Google Play services are missing. **Google: nothing after picking the
  account**: Google is waiting for a person (consent, password, 2-step) on the phone; the flow waits
  `HUMAN_TIMEOUT_MS`.

## Environment configuration problems

- `.env` is read from the repository root; real environment variables override it (that's how CI passes
  values). `doctor` lists unknown keys, which are usually typos.
- `APP_ID` must match the installed package exactly.
- `maestro/config/test-data.js is stale`: run `npm run sync:test-data` (the runner also regenerates it).
- `Parsing Failed at …yaml:<line>`: a YAML problem. Common causes: `: ` or `{ ` inside an unquoted `${…}`
  (move the expression into a helper in `constants.js`), or a `${…}` where Maestro needs a fixed value
  (`scrollUntilVisible.direction`). `npm run check -- --maestro` finds these without a device.
- `InvalidPathException: Illegal char <:>`: a flow `name:` contains a character Windows can't use in a folder
  name; `npm run check` catches it.

## Maestro itself

- Driver problems after a Maestro upgrade: uninstall `dev.mobile.maestro` and `dev.mobile.maestro.test` from
  the phone; Maestro reinstalls them on the next run.
- "WARNING: … sun.misc.Unsafe / final field" lines on Java 24+: harmless; the runner hides them.
- Maestro can't tell you *how* an animation looked: use the evidence screenshots in the report.
