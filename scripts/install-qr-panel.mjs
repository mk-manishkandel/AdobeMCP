/**
 * Installs the QR Code panel for the current macOS user:
 *   ~/Library/Application Support/Adobe/CEP/extensions/com.mkmanishkandel.qrcode
 * It then appears in Illustrator under Window > Extensions > QR Code (restart Illustrator first).
 *
 * Signed (recommended): set ZXPSIGNCMD to Adobe's ZXPSignCmd tool
 * (https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD). The panel is signed with a throwaway
 * self-signed certificate (random password, deleted after use), so Illustrator loads it with no setting changes.
 * Unsigned: Illustrator loads it only with CEP debug mode on; this script never changes that setting.
 *
 *   ZXPSIGNCMD=/path/to/ZXPSignCmd npm run install:qr-panel   build, sign, install
 *   npm run install:qr-panel                                  build, install unsigned
 *   npm run install:qr-panel -- --remove                      uninstall
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { QR_PANEL_DIR, buildAll } from './build-qr-plugin.mjs';

export const BUNDLE_ID = 'com.mkmanishkandel.qrcode';
export const CSXS_DOMAIN = 'com.adobe.CSXS.12';
const EXTENSIONS_DIR = join(homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
const TARGET = join(EXTENSIONS_DIR, BUNDLE_ID);
const CERT_VALIDITY_DAYS = '3650';
const QUIET = { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' };

/** True only for a folder that holds this panel's manifest, so nothing else is ever deleted. */
function isOurPanel(dir) {
  const manifest = join(dir, 'CSXS', 'manifest.xml');
  return existsSync(manifest) && readFileSync(manifest, 'utf8').includes(`ExtensionBundleId="${BUNDLE_ID}"`);
}

function removeOld() {
  if (!existsSync(TARGET)) return false;
  if (!isOurPanel(TARGET)) throw new Error(`${TARGET} exists but is not this panel; remove it yourself if it is safe to.`);
  rmSync(TARGET, { recursive: true });
  return true;
}

function debugModeOn() {
  try {
    return execFileSync('defaults', ['read', CSXS_DOMAIN, 'PlayerDebugMode'], QUIET).trim() === '1';
  } catch {
    return false;
  }
}

/** Runs ZXPSignCmd; its errors go to stdout, so they are surfaced on failure. */
function zxp(tool, args) {
  try {
    return execFileSync(tool, args, QUIET);
  } catch (err) {
    throw new Error(`ZXPSignCmd ${args[0]} failed: ${(err.stdout || err.stderr || err.message).trim()}`);
  }
}

/** Signs the panel into a temporary .zxp and unpacks it into TARGET; the certificate never outlives the call. */
function installSigned(tool) {
  const work = mkdtempSync(join(tmpdir(), 'qr-panel-sign-'));
  const password = randomBytes(24).toString('hex');
  try {
    const cert = join(work, 'cert.p12');
    const pkg = join(work, 'qr-panel.zxp');
    zxp(tool, ['-selfSignedCert', 'XX', 'None', 'AdobeMCP', 'AdobeMCP QR Code', password, cert, '-validityDays', CERT_VALIDITY_DAYS]);
    zxp(tool, ['-sign', QR_PANEL_DIR, pkg, cert, password]);
    mkdirSync(TARGET, { recursive: true });
    execFileSync('unzip', ['-q', pkg, '-d', TARGET], QUIET);
    zxp(tool, ['-verify', TARGET]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function installUnsigned() {
  mkdirSync(TARGET, { recursive: true });
  cpSync(QR_PANEL_DIR, TARGET, { recursive: true });
}

function install() {
  for (const [path, content] of Object.entries(buildAll())) writeFileSync(path, content);
  const tool = process.env.ZXPSIGNCMD;
  if (tool && !existsSync(tool)) throw new Error(`ZXPSIGNCMD points at ${tool}, which does not exist.`);
  removeOld();
  mkdirSync(EXTENSIONS_DIR, { recursive: true });
  if (tool) installSigned(tool);
  else installUnsigned();
  console.log(`Installed the ${tool ? 'signed' : 'unsigned'} QR Code panel to:\n  ${TARGET}`);
  if (tool || debugModeOn()) {
    console.log('\nRestart Illustrator, then open Window > Extensions > QR Code.');
    return;
  }
  console.log('\nThis copy is unsigned. Either install it signed (set ZXPSIGNCMD, see the README) or turn on CEP debug');
  console.log(`mode once with: defaults write ${CSXS_DOMAIN} PlayerDebugMode 1`);
  console.log('Then restart Illustrator and open Window > Extensions > QR Code.');
}

function remove() {
  const removed = removeOld();
  console.log(removed ? `Removed ${TARGET}. Restart Illustrator.` : 'The QR Code panel was not installed.');
}

try {
  if (process.argv.includes('--remove')) remove();
  else install();
} catch (err) {
  console.error(`QR panel install failed: ${err.message}`);
  process.exit(1);
}
