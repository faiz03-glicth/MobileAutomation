# Testability gaps and findings

Things found while automating Streak that make tests weaker or reveal app issues. Each item says what the
suite does meanwhile and what would fix it in the app repository. Found on Streak 1.0.0 (Android build 4),
vivo V2169 / Android 14, 2026-09-27.

## Findings about the app

| # | Finding | Evidence | Suggested fix (app repo) |
| --- | --- | --- | --- |
| F1 | **Toasts are invisible to the accessibility tree.** "You're all set", "Signed out", "Signed in with …" render (see screenshots) but Maestro's hierarchy (UiAutomator, the same tree TalkBack reads) doesn't contain them, so screen-reader users likely never hear them either. | `evidence-onboarding-finished-toast.png` shows the toast; the hierarchy at that moment has no toast node | Give sonner-native toasts an accessible container (`accessibilityLiveRegion="polite"`, `accessibilityRole="alert"`) or announce with `AccessibilityInfo.announceForAccessibility`, and a `testID` |
| F2 | **The onboarding toast covers the top of the + button** for about 3.5 s after "Start tracking" (the Toaster's `offset={104}` sits over the raised FAB). | same screenshot | Raise the toast offset above the FAB, or position it at the top |
| F3 | **Native dialog buttons don't match the JS labels.** Android upper-cases them ("LOG OUT", "CANCEL"), so a test tapping "Log out" fails. The app repo's own `.maestro/onboarding_guest.yaml` does exactly that. | hierarchy of the "Log out?" dialog | None needed in the app; tests tap `android:id/button1` / `button2`. Retire the app repo's `.maestro/` flows in favour of this repo (they are also out of date: e.g. `placeholder-Home`). |
| F5 | **The UI never reports "idle" to Android's automation layer.** The phone logs about 160 "Could not detect idle state" warnings a minute on every screen (Welcome, Login, Home, Heatmap). Every Maestro step waits for idle until its timeout, so flows run 3 to 5× slower than they should (the tab-bar flow takes ~3 min), and heavy screens (the Heatmap and its sheets) pushed Maestro's on-device driver past its 11 s deadline. Cause not yet isolated: a continuously animating view in the app (the animated background glow, glass blur) or a vivo system overlay (an edge panel is visible in screenshots); see the check below. | `maestro/**/logs/device-logcat.txt` (`QueryController: Could not detect idle state`) | If it is the app: stop animations that never end when nothing changes (or pause them when the screen is static); a constantly redrawing view also costs battery. |
| F6 | **Typed text is rewritten by the keyboard.** Gboard turned `"  Person@Example.com "` into `"Person@Example.com .com"` (leading spaces dropped, ".com" inserted after the trailing space). | TC-AUTH-003 run 2026-09-27 17:27 | None in the app (it trims and validates correctly); tests avoid typing leading/trailing spaces. Consider `autoCorrect={false}` + `autoComplete="email"` already set, so this is the keyboard's email suggestions. |
| F7 | **Android Back on Login's email step leaves Login entirely.** From "Continue with email", the system Back button returns to Welcome instead of the sign-in options; the on-screen Back correctly goes one step. Onboarding handles Android Back one page at a time (`BackHandler` in `useOnboardingViewModel`), Login doesn't. TC-AUTH-003 fails on purpose until this is fixed. | TC-AUTH-003, run 2026-09-27 18:15 (screenshot shows Welcome after Back) | Add a `BackHandler` in `useLoginViewModel` that calls the same `onBack` while `step !== 'providers'` |
| F4 | **The build on the phone changed during this session** (build 3 → 4 at 16:00 on 2026-09-27; the Home heatmap changed from day cells `day-…` to month targets `month-…`). | `adb dumpsys package` | Nothing to fix; it's why every run records the installed build in its summary. Share the test phone deliberately. |

## Missing test IDs

These controls are found by their accessibility label inside their screen (`childOf`). That works, but a
copy change breaks the test and some labels collide (Android's navigation bar also has "Back" and "Home").

| Control | Screen | Selector used now | Suggested `testID` |
| --- | --- | --- | --- |
| Continue with Google | Login | label "Continue with Google" | `login-google` |
| Back (NavBar) | every stacked screen | label "Back" inside the screen | `nav-back` |
| Heatmap year title ("2026 ⌄") | Home | regex `\d{4}, .+ check-ins?` | `home-heatmap-open` |
| Profile avatar | Home | label "Profile" inside Home | `home-profile` |
| Previous / Next months | Home | labels | `home-months-previous` / `-next` |
| Today line ("Today · 2 check-ins") | Home | label "Today, N check-ins" | `home-today` |
| See all | Home | label | `home-see-all` |
| Log your first check-in | Home | label | `home-first-check-in` |
| Previous / Next year and month | Heatmap | labels | `calendar-previous` / `calendar-next` |
| Edit profile (pencil) | Profile | label | `profile-edit` |
| Export data, About Streak, Help & feedback | Profile | labels | `profile-export`, `profile-about`, `profile-help` |

## Limits of what Maestro can assert

- **Animation frames.** Maestro reads the view hierarchy, not frames: it can prove the heatmap wave starts,
  settles, leaves the heatmap whole and never blocks a tap, but not that each diagonal lands in order. The
  wave flow takes screenshots before, during and after as evidence. To assert phases, the app could expose
  them to automation, e.g. `accessibilityValue={{ text: phase }}` (`entrance | collapse | stack | rest`) on
  `holdable-heatmap` in non-production builds.
- **Sub-second loading states** ("Sending…", "Verifying…", "Connecting…") are usually gone before the next
  hierarchy snapshot on a fast network. They're recorded as screenshot evidence; deterministic checks need
  a throttled network (CI emulator: `adb emu network speed gsm`).
- **Colour and intensity.** Heat levels are checked through the cells' labels ("Sep 27: 2 check-ins"), not
  their colour; visual regression would need a screenshot-diff tool.
