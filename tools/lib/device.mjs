// The Android device under test, through adb: which one, what it is, and what app build it has.
import { capture } from './binaries.mjs';

const adbRun = (adb, serial, args, options) => capture(adb, serial ? ['-s', serial, ...args] : args, options);

/** `adb devices -l` → [{ serial, state, model }] */
export function listDevices(adb) {
  const result = capture(adb, ['devices', '-l']);
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      const model = /model:(\S+)/.exec(line)?.[1] ?? '';
      return { serial, state, model };
    });
}

/** Wireless debugging: an "ip:port" or an mDNS "adb-…._adb-tls-connect._tcp" serial. */
export const isWireless = (serial) => /:\d+$/.test(serial) || serial.includes('._adb-tls-connect.');

/**
 * Wireless debugging drops now and then (network change, Wi-Fi power saving). A phone that was paired before
 * keeps advertising itself over mDNS as `_adb-tls-connect`: connect to those again. Returns what it tried.
 */
export function reconnectWireless(adb) {
  const services = capture(adb, ['mdns', 'services'], { timeout: 20_000 }).stdout;
  const targets = [...services.matchAll(/_adb-tls-connect\._tcp\.?\s+(\d{1,3}(?:\.\d{1,3}){3}:\d+)/g)].map((m) => m[1]);
  for (const target of targets) capture(adb, ['connect', target], { timeout: 20_000 });
  return targets;
}

/**
 * Picks the device to test on: the one asked for, or the only one connected. A phone on wireless debugging
 * often shows up twice (its mDNS name and its ip:port); those count as one. If nothing is connected, it
 * first tries to reconnect paired phones over Wi-Fi.
 */
export function resolveDevice(adb, preferred, { reconnect = true } = {}) {
  let all = listDevices(adb);
  let ready = all.filter((device) => device.state === 'device');
  const missing = preferred ? !ready.some((device) => device.serial === preferred) : ready.length === 0;
  if (missing && reconnect && reconnectWireless(adb).length) {
    all = listDevices(adb);
    ready = all.filter((device) => device.state === 'device');
  }
  if (preferred) {
    const match = ready.find((device) => device.serial === preferred);
    if (match) return { device: match, all };
    return { error: `Device "${preferred}" is not connected (or not authorised).`, all };
  }
  if (ready.length === 0) return { error: 'No device connected.', all };
  const byHardware = new Map();
  for (const device of ready) {
    const hardware = adbRun(adb, device.serial, ['shell', 'getprop', 'ro.serialno']).stdout.trim() || device.serial;
    if (!byHardware.has(hardware)) byHardware.set(hardware, device);
  }
  if (byHardware.size > 1) {
    return {
      error: 'More than one device is connected: set DEVICE_ID in .env or pass --device <serial>.',
      all,
    };
  }
  return { device: [...byHardware.values()][0], all };
}

const shellWorks = (adb, serial) =>
  capture(adb, ['-s', serial, 'shell', 'echo', 'alive'], { timeout: 15_000 }).stdout.includes('alive');

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function reconnectOnce(adb, serial) {
  if (shellWorks(adb, serial)) return serial;
  if (/:\d+$/.test(serial)) {
    capture(adb, ['disconnect', serial], { timeout: 15_000 });
    capture(adb, ['connect', serial], { timeout: 20_000 });
    if (shellWorks(adb, serial)) return serial;
  }
  reconnectWireless(adb);
  const ready = listDevices(adb).filter((device) => device.state === 'device');
  return ready.map((device) => device.serial).find((candidate) => shellWorks(adb, candidate)) ?? null;
}

/**
 * Makes sure the device answers (adb can list a Wi-Fi device as "device" after the link died), reconnecting
 * a dropped wireless connection and waiting up to `waitMs` for the phone to come back (Wi-Fi drops often
 * last tens of seconds). Returns the serial to use (it can change from the mDNS name to ip:port), or null.
 */
export function ensureConnected(adb, serial, { waitMs = 90_000, onWait } = {}) {
  const deadline = Date.now() + waitMs;
  let waited = false;
  for (;;) {
    const found = reconnectOnce(adb, serial);
    if (found) return found;
    if (Date.now() > deadline) return null;
    if (!waited) onWait?.();
    waited = true;
    pause(5_000);
  }
}

export function deviceInfo(adb, serial) {
  const prop = (name) => adbRun(adb, serial, ['shell', 'getprop', name]).stdout.trim();
  return {
    serial,
    connection: isWireless(serial) ? 'Wi-Fi (wireless debugging)' : 'USB',
    brand: prop('ro.product.brand'),
    model: prop('ro.product.model'),
    android: prop('ro.build.version.release'),
    sdk: prop('ro.build.version.sdk'),
    timezone: prop('persist.sys.timezone'),
  };
}

/** The installed build of the app under test (null when it isn't installed). */
export function appInfo(adb, serial, appId) {
  const dump = adbRun(adb, serial, ['shell', 'dumpsys', 'package', appId]).stdout;
  const versionName = /versionName=(\S+)/.exec(dump)?.[1];
  if (!versionName) return null;
  return {
    appId,
    versionName,
    versionCode: /versionCode=(\d+)/.exec(dump)?.[1] ?? '',
    lastUpdateTime: /lastUpdateTime=([^\r\n]+)/.exec(dump)?.[1]?.trim() ?? '',
    debuggable: /flags=\[[^\]]*DEBUGGABLE/.test(dump),
  };
}

/** Crash buffer since boot (native and Java crashes of any app, including ours). */
export function crashLog(adb, serial) {
  return adbRun(adb, serial, ['logcat', '-d', '-b', 'crash'], { timeout: 30_000 }).stdout;
}

/** Current device time, used to cut the crash log to this run. */
export function deviceNow(adb, serial) {
  return adbRun(adb, serial, ['shell', 'date', '+%m-%d %H:%M:%S']).stdout.trim();
}
