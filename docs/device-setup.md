# Device setup: laptop → Wi-Fi → phone → app → Maestro

```text
Laptop (Maestro CLI + adb)
   │  adb over Wi-Fi ("Wireless debugging"): the only channel Maestro uses
   ▼
Android phone
   │  Maestro installs two helper apps on first run (dev.mobile.maestro, dev.mobile.maestro.test)
   ▼
Streak (the build under test, e.g. com.faiz.streak)
   ▲
   └── Maestro flows drive it: taps, typing, assertions on the view hierarchy
```

**Being on the same Wi-Fi is not enough.** Maestro controls the phone only through `adb`, so the phone
must have wireless debugging on and be *connected and authorised* in `adb devices`. Wireless debugging
switches itself off when the phone changes network or restarts, and its port changes every time.

Verified setup (2026-09-27): Windows 11 laptop, vivo V2169 on Android 14 over wireless debugging, Maestro
2.10.0, Java 26, Node 24.

## 1. Android SDK platform-tools

`adb` comes with Android Studio (`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` on Windows,
`~/Library/Android/sdk/platform-tools/adb` on macOS) or the standalone
[platform-tools](https://developer.android.com/tools/releases/platform-tools) download. The runner finds it
in those places, on `PATH`, or at `ADB_BIN` in `.env`. On Windows, add it to `PATH` to type `adb` yourself:

```powershell
$env:Path += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
```

## 2. Install Maestro

Maestro needs **Java 17 or newer** (`java -version`; set `JAVA_HOME` if several are installed).

- **Windows:** download `maestro.zip` from the
  [Maestro releases](https://github.com/mobile-dev-inc/maestro/releases), extract it so that
  `%USERPROFILE%\maestro\bin\maestro.bat` exists. The runner looks there automatically; to also run
  `maestro` by hand, add `%USERPROFILE%\maestro\bin` to your user PATH.
- **macOS / Linux:** `curl -fsSL "https://get.maestro.mobile.dev" | bash`

Check: `npm run doctor` shows the Maestro version. (On Java 24+, Maestro prints harmless "WARNING: …
Unsafe/final field" lines; the runner hides them.)

## 3. Connect the phone over Wi-Fi

Once per phone:

1. **Developer options:** Settings → About phone → tap *Build number* (vivo: *Software version*) seven times.
2. **Wireless debugging:** Settings → Developer options → *Wireless debugging* → on (Android 11+).
   Laptop and phone on the same Wi-Fi network (not a guest network that isolates devices).
3. **Pair:** in Wireless debugging tap *Pair device with pairing code*, then on the laptop:
   ```bash
   adb pair <phone-ip>:<pairing-port>
   ```
   (the IP:port and 6-digit code shown in that dialog; the pairing port is different from the connect port).
4. On vivo, Xiaomi and some other brands also turn on *USB debugging (Security settings)* / *Disable
   permission monitoring* in Developer options, or taps and typing from Maestro are silently ignored.

Every session (after a restart or network change):

```bash
adb mdns services
adb connect <phone-ip>:<port>
adb devices -l
```

`adb mdns services` lists a paired phone as `_adb-tls-connect` with its current IP:port, and adb often
connects it by itself. `adb devices -l` must show the phone as **`device`** (not `unauthorized` or
`offline`). The same phone may be listed twice (its mDNS name and its IP:port); the runner treats that as one
device. To pin a device, put its serial in `.env` as `DEVICE_ID`.

Android 10 or older: connect by USB once, run `adb tcpip 5555`, unplug, then `adb connect <phone-ip>:5555`.

If the connection drops, the runner reconnects paired phones by itself (it runs `adb mdns services` and
`adb connect` for you) before a run, and once more if the phone is lost during a run.

Keep the phone awake, unlocked and **charging** while tests run: Developer options → *Stay awake* (only works
while charging), and no screen lock on a test phone. On battery, Android is quicker to drop wireless
debugging. Leave system animations **on**: the heatmap-wave tests check that the app's
animations never block interaction.

## 4. Install the app

Tests need an installed **standalone** build (release or EAS *preview*). A development build (dev client)
loads its JavaScript from Metro, and `clearState` makes it forget the Metro address, so it opens the Expo
dev launcher instead of the app.

From the app repository (`-Ada`):

```bash
npx eas-cli@latest build --profile preview --platform android
adb install -r path/to/streak-preview.apk
```

The EAS build page also gives an install link/QR code for the phone.

**Test data warning:** almost every flow starts with Maestro's `clearState`, which erases the app's data on
the phone (check-ins, session, settings). Use a phone whose Streak data you don't need, or install a separate
build next to your everyday one: in the app repo, `APP_VARIANT=local` builds `com.faiz.streak.local`
("Streak Local"). Then set `APP_ID=com.faiz.streak.local` in `.env`. That build must have been built with
valid `EXPO_PUBLIC_*` values, otherwise it opens on a configuration error screen.

## 5. Check everything

```bash
npm run doctor
npm run inspect
```

`doctor` checks Node, Java, Maestro, adb, the connected device, the installed app build and `.env`.
`inspect` prints the elements on the phone's current screen (test IDs, texts, accessibility labels, states),
which also proves Maestro can talk to the phone.

## 6. Run a smoke test

```bash
npm run test:smoke
```

About 2 minutes. The phone launches Streak, clears it, goes through onboarding, Home and the Heatmap.

## 7. Run the full regression

```bash
npm run test:regression
```

About 15 to 20 minutes over Wi-Fi. Email-sign-in flows run only when their accounts are configured
([test-accounts.md](test-accounts.md)); the Google flow is interactive and runs with `npm run test:google`.

## 8. Collect failures and logs

Every run writes `reports/runs/<date>_<time>_<suite>/`. Open its `summary.md` (or `npm run report`): each
failure names the test cases, failing step, expected and actual result, and links the screenshot, screen
hierarchy and device log. The console output, the Android crash log and JUnit XML are next to it. See
[../reports/README.md](../reports/README.md).
