'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APPLY = path.join(__dirname, '..', 'apply-patch.js');

// The shapes the four call sites actually have in the compiled server, copied
// from v2.39.5 so a fixture that drifts from reality fails loudly.
const FILES = {
  'engine/core-modules/auth/strategies/google-apis-oauth-common.auth.strategy.js': `
    const options = {
      clientID: twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
      callbackURL: twentyConfigService.get('AUTH_GOOGLE_APIS_CALLBACK_URL'),
      scope: scopes,
    };
  `,
  'engine/core-modules/auth/services/google-apis-service-availability.service.js': `
    const oAuth2Client = new google.auth.OAuth2({
      clientId: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
    });
  `,
  'modules/connected-account/refresh-tokens-manager/drivers/google/services/google-api-refresh-tokens.service.js': `
    const oAuth2Client = new google.auth.OAuth2({
      clientId: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
    });
  `,
  'modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider.js': `
    const clientId = this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID');
    const clientSecret = this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET');
  `,
  'engine/core-modules/auth/strategies/google.auth.strategy.js': `
    const options = {
      clientID: twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
      callbackURL: twentyConfigService.get('AUTH_GOOGLE_CALLBACK_URL'),
    };
  `,
};

const SIGN_IN =
  'engine/core-modules/auth/strategies/google.auth.strategy.js';

let dist;

const write = (relativePath, contents) => {
  const file = path.join(dist, relativePath);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};

const read = (relativePath) =>
  fs.readFileSync(path.join(dist, relativePath), 'utf8');

const run = () => execFileSync('node', [APPLY, dist], { encoding: 'utf8' });

const runExpectingFailure = () => {
  try {
    execFileSync('node', [APPLY, dist], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return error.stderr.toString();
  }

  throw new Error('expected the patch to fail');
};

describe('google-apis-oauth patch', () => {
  beforeEach(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'gapi-dist-'));

    for (const [relativePath, contents] of Object.entries(FILES)) {
      write(relativePath, contents);
    }
  });

  it('points every Google APIs call site at the new client', () => {
    run();

    for (const relativePath of Object.keys(FILES)) {
      if (relativePath === SIGN_IN) {
        continue;
      }

      const patched = read(relativePath);

      assert.match(patched, /process\.env\.AUTH_GOOGLE_APIS_CLIENT_ID \|\|/);
      assert.match(patched, /process\.env\.AUTH_GOOGLE_APIS_CLIENT_SECRET \|\|/);
    }
  });

  it('patches the refresh path, not just the consent path', () => {
    run();

    // Tokens issued by the new client must be refreshed with it too, or Google
    // answers invalid_client on the first refresh.
    assert.match(
      read(
        'modules/connected-account/refresh-tokens-manager/drivers/google/services/google-api-refresh-tokens.service.js',
      ),
      /process\.env\.AUTH_GOOGLE_APIS_CLIENT_ID \|\| this\.twentyConfigService/,
    );
  });

  it('keeps the shared client as the fallback', () => {
    run();

    assert.match(
      read(
        'engine/core-modules/auth/strategies/google-apis-oauth-common.auth.strategy.js',
      ),
      /\|\| twentyConfigService\.get\('AUTH_GOOGLE_CLIENT_ID'\)\)/,
    );
  });

  it('leaves the sign-in strategy on the shared client', () => {
    run();

    assert.equal(read(SIGN_IN), FILES[SIGN_IN]);
  });

  it('produces syntactically valid javascript', () => {
    run();

    for (const relativePath of Object.keys(FILES)) {
      execFileSync('node', ['--check', path.join(dist, relativePath)]);
    }
  });

  it('refuses to run twice', () => {
    run();

    assert.match(runExpectingFailure(), /already patched/);
  });

  it('fails when a call site moved', () => {
    write(
      'modules/connected-account/refresh-tokens-manager/drivers/google/services/google-api-refresh-tokens.service.js',
      'const oAuth2Client = new google.auth.OAuth2(someRefactoredConfig);',
    );

    assert.match(runExpectingFailure(), /expected exactly 1 AUTH_GOOGLE_CLIENT_ID read/);
  });

  it('fails when a target file disappears', () => {
    fs.rmSync(
      path.join(
        dist,
        'modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider.js',
      ),
    );

    assert.match(runExpectingFailure(), /is missing/);
  });

  it('fails when upstream stops reading the credentials in sign-in', () => {
    write(SIGN_IN, 'const options = { clientID: somethingElse };');

    assert.match(runExpectingFailure(), /no longer reads AUTH_GOOGLE_CLIENT_ID/);
  });
});
