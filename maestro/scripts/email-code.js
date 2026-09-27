// Gets a valid 6-digit sign-in code for the dummy account (TEST_USER_EMAIL) from the runner's OTP broker
// (tools/lib/otp-broker.mjs). The broker asks Supabase Auth's admin API for it, so the Supabase key stays in
// the runner process: Maestro only knows a localhost URL that works for this one run. Sets output.otp.code.
const broker = output.env.otpBrokerUrl
if (!broker) {
  throw new Error(
    'No OTP broker. Run through the npm scripts with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (docs/test-accounts.md).',
  )
}

const response = http.post(broker, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: output.env.testUserEmail }),
})
let body = {}
try {
  body = json(response.body)
} catch (error) {
  body = { error: String(response.body).slice(0, 200) }
}
if (!response.ok) {
  throw new Error('OTP broker failed (HTTP ' + response.status + '): ' + (body.error || 'no details'))
}
if (!/^\d{6}$/.test(String(body.code || ''))) {
  throw new Error('OTP broker answered without a 6-digit code')
}
output.otp = { code: String(body.code) }
console.log('Got a sign-in code for the dummy account from the OTP broker')
