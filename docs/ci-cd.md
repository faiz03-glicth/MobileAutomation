# CI/CD readiness

Nothing runs in CI yet on purpose. This page is the plan, so a pipeline can be added without restructuring.

## Local device testing vs CI device testing

| | Local (today) | CI (later) |
| --- | --- | --- |
| Device | your phone over Wi-Fi (wireless debugging) | an Android emulator on the runner, or a device farm / Maestro Cloud |
| App build | whatever is installed (`doctor` records its version) | the build produced by the same pipeline, installed by the job |
| App data | wiped by `clearState` (use a test phone or `com.faiz.streak.local`) | fresh emulator every run |
| Accounts | `.env` | masked, protected CI variables (same names) |
| Google sign-in | `npm run test:google`, a person finishes Google's prompts | not run (interactive) |
| Speed | Wi-Fi adb latency; animations on | emulator without GPU is slow: `TIMEOUT_SCALE=2` |
| Time zone | laptop and phone usually agree | set the emulator's time zone, or pass `-e TODAY=` |
| Results | `reports/runs/<run>/summary.md` | same folder published as job artifacts + `junit.xml` as test report |

Everything else (flows, test data, runner, report format) is identical; that's the point of the runner.

## Pipeline outline

```text
Merge request in MobileAutomation, or a new app build
      │
      ├─ check          npm run check -- --maestro          (no device; seconds to minutes)
      │
      ├─ build app      EAS preview APK (app repo: eas build --profile preview --platform android)
      │                 or download the APK the app pipeline produced
      ├─ start device   Android emulator (API 34, x86_64, hardware acceleration)
      ├─ install        adb install -r streak.apk
      ├─ smoke          npm run test:smoke                  (gate: stop here if red)
      ├─ regression     npm run test:regression
      └─ publish        reports/runs/** as artifacts, junit.xml as the test report
```

Trigger it from this repo's merge requests, nightly on `main`, and from the app repo's pipeline after a
preview build (a downstream/trigger job passing the APK URL).

## Example: GitLab CI (template, not active)

```yaml
e2e-android:
  image: ghcr.io/cirruslabs/android-sdk:34   # any image with Android SDK + emulator + Java 17
  tags: [kvm]                                # emulator needs KVM on the runner
  variables:
    TIMEOUT_SCALE: '2'
  script:
    - curl -fsSL "https://get.maestro.mobile.dev" | bash && export PATH="$PATH:$HOME/.maestro/bin"
    - sdkmanager "system-images;android-34;google_apis;x86_64"
    - echo no | avdmanager create avd -n ci -k "system-images;android-34;google_apis;x86_64"
    - emulator -avd ci -no-window -no-audio -no-boot-anim &
    - adb wait-for-device shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
    - adb install -r "$APK_PATH"
    - npm run check
    - npm run test:smoke
    - npm run test:regression
  artifacts:
    when: always
    paths: [reports/runs/]
    reports:
      junit: reports/runs/*/junit.xml
```

## Example: GitHub Actions (template, not active)

```yaml
jobs:
  e2e-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: curl -fsSL "https://get.maestro.mobile.dev" | bash && echo "$HOME/.maestro/bin" >> $GITHUB_PATH
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules && sudo udevadm trigger --name-match=kvm
      - uses: reactivecircus/android-emulator-runner@v2
        env:
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TIMEOUT_SCALE: '2'
        with:
          api-level: 34
          arch: x86_64
          script: |
            adb install -r streak.apk
            npm run test:smoke
            npm run test:regression
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: e2e-reports, path: reports/runs/ }
```

## Before switching it on

- Decide where CI gets the APK (EAS artifact URL via `eas build --json`, or the app pipeline's artifact).
- Use a staging Supabase project and custom SMTP for the dummy account (email rate limits,
  [test-accounts.md](test-accounts.md)).
- Keep `interactive` flows out (they are by default).
- Consider Maestro Cloud or a device farm if emulator runs are too slow; the flows need no changes.
