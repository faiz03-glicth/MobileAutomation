// A tiny local HTTP service that hands Maestro a valid email sign-in code for the dummy account.
//
// Why it exists: Maestro writes every `-e` parameter and every MAESTRO_* variable into its reports
// (commands.json, maestro.log), so the Supabase service_role key can't be given to Maestro. The runner keeps
// the key and listens on 127.0.0.1 at an unguessable path that lives only for this run; Maestro's
// scripts/email-code.js posts to it. Only TEST_USER_EMAIL can get a code.
//
// How the code is made: Supabase Auth's admin "generate_link" (type magiclink) returns `email_otp`, a fresh
// code for that address that the app's verifyOtp({ type: 'email' }) accepts. No email is sent for it.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const normalize = (email) => String(email ?? '').trim().toLowerCase();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export async function requestEmailOtp({ supabaseUrl, serviceRoleKey, email }) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = data.msg || data.message || data.error_description || data.error || 'no details';
    throw new Error(`Supabase answered HTTP ${response.status}: ${reason}`);
  }
  const code = data.email_otp ?? data.properties?.email_otp;
  if (!code) throw new Error('Supabase returned no email_otp');
  return String(code);
}

export async function startOtpBroker({ supabaseUrl, serviceRoleKey, allowedEmail, log = () => {} }) {
  const token = randomBytes(18).toString('hex');
  const path = `/otp/${token}`;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== path) return send(res, 404, { error: 'not found' });
    const { email } = await readJson(req);
    if (normalize(email) !== normalize(allowedEmail)) {
      return send(res, 403, { error: 'codes are only issued for TEST_USER_EMAIL' });
    }
    try {
      const code = await requestEmailOtp({ supabaseUrl, serviceRoleKey, email: normalize(email) });
      log('OTP broker: issued a sign-in code for the dummy account');
      return send(res, 200, { code });
    } catch (error) {
      log(`OTP broker: ${error.message}`);
      return send(res, 502, { error: error.message });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}${path}`,
    token,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
