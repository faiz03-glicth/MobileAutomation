// Run settings for Maestro: parameters passed with `-e` (by tools/run.mjs), timeouts, today's date and the
// helpers flows use to turn test-data templates into selectors. Runs right after config/test-data.js, before
// every test flow (components/common/bootstrap.yaml). Everything a flow needs is reachable from `output`.

// `-e NAME=value` parameters are JavaScript globals (strings). Missing ones fall back to the default.
function param(name, fallback) {
  const value = globalThis[name]
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value))
const scale = Number(param('TIMEOUT_SCALE', '1')) || 1
const ms = (base) => Math.round(base * scale)

const contract = output.data.contract

output.env = {
  appId: param('APP_ID', contract.app.androidPackage),
  testUserEmail: param('TEST_USER_EMAIL', ''),
  // Private: only ever comes from .env / CI variables.
  googleAccount: param('GOOGLE_TEST_ACCOUNT', ''),
  googleAutoPick: truthy(param('GOOGLE_AUTO_PICK', 'true')),
  // A one-run localhost URL served by the runner (tools/lib/otp-broker.mjs); empty when it isn't running.
  otpBrokerUrl: param('OTP_BROKER_URL', ''),
}

// Milliseconds. TIMEOUT_SCALE=1.5 (or more) stretches every wait on a slow device or emulator.
output.timeouts = {
  launch: ms(30000),
  screen: ms(10000),
  sheet: ms(8000),
  animation: ms(5000),
  network: ms(25000),
  scroll: ms(15000),
  // How long a person gets to finish a step the test can't do (Google's own screens).
  human: Number(param('HUMAN_TIMEOUT_MS', '180000')),
}

// Short names for the UI contract (test-data/ui-contract.json) and the scenario inputs.
output.ids = contract.ids
output.screens = contract.screens
output.labels = contract.labels
output.inputs = output.data.inputs

// ----- Dates -------------------------------------------------------------------------------------------
// The app keys its heatmap by the phone's local date. Tests assume the laptop and phone agree; near midnight
// or across time zones pass -e TODAY=YYYY-MM-DD with the phone's date.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const pad = (n) => (n < 10 ? '0' + n : String(n))

function describe(date) {
  const year = date.getFullYear()
  const month0 = date.getMonth()
  const day = date.getDate()
  return {
    year: String(year),
    month0: String(month0),
    day: String(day),
    iso: year + '-' + pad(month0 + 1) + '-' + pad(day),
    monthLong: MONTHS[month0],
    monthShort: MONTHS[month0].slice(0, 3),
  }
}

function startDate() {
  const override = param('TODAY', '')
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(override)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date()
}

const now = startDate()
const monthsAgo = (count) => describe(new Date(now.getFullYear(), now.getMonth() - count, 1))

output.today = describe(now)
output.monthsAgo = monthsAgo

// ----- Templates ---------------------------------------------------------------------------------------
// Maestro matches `text` selectors as regular expressions: this makes a value (an email with a "+" or ".")
// match only itself.
output.literal = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Fills {year} {month0} {iso} (today by default) and any extra {name} given in `values`.
output.fill = function (template, values) {
  const all = Object.assign({}, output.today, values || {})
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => (key in all ? all[key] : whole))
}

// Small selector helpers, so flows stay one-liners (YAML can't hold `a ? b : c` or `{ k: v }` unquoted).
output.step = (n) => output.fill(output.labels.onboarding.step, { n: n })
output.activityTile = (activity) => output.fill(output.ids.onboarding.activity, { activity: activity })
output.loginScreenKey = (intent) => (intent == 'new' ? 'loginNew' : 'loginExisting')
output.loginScreen = (intent) => output.screens[output.loginScreenKey(intent)]
output.loginTitle = (intent) => (intent == 'new' ? output.labels.login.newTitle : output.labels.login.existingTitle)
output.codeSubtitle = (email) =>
  output.fill(output.labels.login.codeSubtitle, { email: output.literal(email.trim().toLowerCase()) })
output.dialogButton = (choice) =>
  choice == 'confirm' ? output.ids.androidDialog.confirm : output.ids.androidDialog.cancel

// Home's heatmap header ("2026, Jul – Sep, 3 check-ins") for the 3 months ending `back` months ago.
output.homeHeader = function (back) {
  const last = monthsAgo(back)
  const first = monthsAgo(back + 2)
  return last.year + ', ' + first.monthShort + ' . ' + last.monthShort + ', .+'
}

// A month on a heatmap ("September 2026, 1 check-in") as its screen-reader label.
output.monthLabel = function (month, checkIns) {
  return month.monthLong + ' ' + month.year + ', ' + checkIns + ' check-ins?'
}

// Today's tile on the Heatmap's month view ("Sep 27: 2 check-ins") as its screen-reader label.
output.todayTileLabel = (checkIns) => output.today.monthShort + ' ' + output.today.day + ': ' + checkIns + ' check-ins?'

// The test ID of a month on a heatmap, `back` months before this one (0 = this month).
output.monthTarget = (back) => output.fill(output.ids.heatmap.month, monthsAgo(back))

// ----- Interaction audit -------------------------------------------------------------------------------
// Prepares one table from test-data/interaction-audit.json for components/audit/audit_screen.yaml.
output.startAudit = function (name) {
  const table = output.data.audit[name]
  if (!table) throw new Error('No interaction audit named "' + name + '" in test-data/interaction-audit.json')
  return {
    name: name,
    screen: table.screen,
    recover: table.recover || '',
    index: 0,
    failed: [],
    elements: table.elements.map((element) => ({
      name: element.name,
      id: element.id ? output.fill(element.id) : '',
      text: element.text || '',
      expect: output.fill(element.expect),
      back: element.back || 'none',
    })),
  }
}

console.log('Run settings: app ' + output.env.appId + ', today ' + output.today.iso + ', timeout scale ' + scale)
