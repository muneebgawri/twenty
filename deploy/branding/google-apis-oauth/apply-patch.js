'use strict';

// Lets the Gmail/Calendar OAuth flow use its own Google client, separate from
// the one behind "Sign in with Google".
//
// Twenty reads a single AUTH_GOOGLE_CLIENT_ID/SECRET pair for both, so adding
// the Gmail scopes to it would put a restricted-scope consent screen in front
// of every sign-in. This rewrites only the four call sites on the Google APIs
// side to prefer AUTH_GOOGLE_APIS_CLIENT_ID/SECRET when set, falling back to
// the shared pair when they are not — so an environment that does not set them
// behaves exactly as before.
//
// All four matter. The consent flow issues the token, and the other three
// refresh it and call the APIs with it; patching only the first would hand out
// tokens from the new client and then try to refresh them with the old one,
// which Google rejects with invalid_client about an hour later — a silent death
// identical to the one this is meant to fix.
//
// Run at image build time. Fails the build if any call site moved, so a Twenty
// upgrade cannot quietly ship an image that reverts to one client.

const fs = require('node:fs');
const path = require('node:path');

const DIST =
  process.argv[2] || '/app/packages/twenty-server/dist';

const MARKER = 'AUTH_GOOGLE_APIS_CLIENT_ID';

// Everything on the Google APIs side. Sign-in is deliberately absent.
const TARGETS = [
  'engine/core-modules/auth/strategies/google-apis-oauth-common.auth.strategy.js',
  'engine/core-modules/auth/services/google-apis-service-availability.service.js',
  'modules/connected-account/refresh-tokens-manager/drivers/google/services/google-api-refresh-tokens.service.js',
  'modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider.js',
];

// The sign-in strategy must keep the minimal-scope client.
const SIGN_IN = 'engine/core-modules/auth/strategies/google.auth.strategy.js';

const expression = (variable) =>
  new RegExp(
    `((?:[A-Za-z_$][\\w$]*\\.)?twentyConfigService\\.get\\('AUTH_GOOGLE_${variable}'\\))`,
    'g',
  );

const fail = (message) => {
  console.error(`google-apis-oauth patch: ${message}`);
  process.exit(1);
};

const patchFile = (relativePath) => {
  const file = path.join(DIST, relativePath);

  if (!fs.existsSync(file)) {
    fail(`${relativePath} is missing. Re-check upstream.`);
  }

  const source = fs.readFileSync(file, 'utf8');

  if (source.includes(MARKER)) {
    fail(`${relativePath} is already patched; build from a clean image.`);
  }

  let patched = source;

  for (const variable of ['CLIENT_ID', 'CLIENT_SECRET']) {
    const pattern = expression(variable);
    const occurrences = source.match(pattern);

    if (!occurrences || occurrences.length !== 1) {
      fail(
        `expected exactly 1 AUTH_GOOGLE_${variable} read in ${relativePath}, found ${
          occurrences ? occurrences.length : 0
        }. Re-check upstream.`,
      );
    }

    patched = patched.replace(
      pattern,
      `(process.env.AUTH_GOOGLE_APIS_${variable} || $1)`,
    );
  }

  fs.writeFileSync(file, patched);
  console.log(`google-apis-oauth patch applied to ${relativePath}`);
};

for (const target of TARGETS) {
  patchFile(target);
}

// Guard the other half of the point: sign-in keeps the minimal-scope client.
const signInFile = path.join(DIST, SIGN_IN);

if (!fs.existsSync(signInFile)) {
  fail(`${SIGN_IN} is missing. Re-check upstream.`);
}

const signInSource = fs.readFileSync(signInFile, 'utf8');

if (signInSource.includes(MARKER)) {
  fail('the sign-in strategy was patched; it must keep the shared client.');
}

if (!signInSource.includes("twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID')")) {
  fail(`${SIGN_IN} no longer reads AUTH_GOOGLE_CLIENT_ID. Re-check upstream.`);
}

console.log('google-apis-oauth patch: sign-in strategy left on the shared client');
