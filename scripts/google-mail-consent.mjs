#!/usr/bin/env node
/**
 * One-time Google OAuth consent for the transactional mailbox.
 *
 * Produces the GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN for one environment and
 * proves it works, without the token ever passing through a chat, a doc, or a
 * shell history line. docs/GOOGLE_WORKSPACE_EMAIL_SETUP.md is the design; this
 * is the missing step 4 ("obtain offline consent").
 *
 *   npm run mail:consent                       prints the refresh token once
 *   npm run mail:consent -- --put --env production
 *   npm run mail:consent -- --put --env staging
 *                                              pipes it straight into
 *                                              `wrangler secret put` instead
 *
 * Inputs are the OAuth client id and secret of the internal "NexPhase
 * Transactional Mail" client (Google Cloud → APIs & Services → Credentials).
 * Pass them as GOOGLE_WORKSPACE_OAUTH_CLIENT_ID / _CLIENT_SECRET, or answer the
 * prompts (the secret prompt is hidden). Nothing is written to disk.
 *
 * The consent screen must be completed as the mailbox the Worker sends from
 * (GOOGLE_WORKSPACE_SENDER, default sam@nexphaselabs.net). Each run with
 * prompt=consent mints a NEW refresh token; earlier ones keep working, which is
 * what lets staging and production hold different tokens.
 *
 * Google has to know the loopback address this script listens on. For the web
 * client, add exactly  http://127.0.0.1:8788/callback  under "Authorized
 * redirect URIs" once (or set OAUTH_PORT to a port that is already listed).
 * If Google shows "Error 400: redirect_uri_mismatch", that is the fix.
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 5 * 60 * 1000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const log = (line) => process.stderr.write(`${line}\n`);
const die = (line) => {
  log(`\n${line}`);
  process.exit(1);
};

if (flag('--help') || flag('-h')) {
  log(`Usage: node scripts/google-mail-consent.mjs [--put --env production|staging] [--port 8788] [--sender sam@nexphaselabs.net]`);
  process.exit(0);
}
const put = flag('--put');
const env = option('--env');
if (put && env !== 'production' && env !== 'staging') die('--put needs --env production or --env staging.');
if (!put && env) die('--env only applies with --put.');
const port = Number(process.env.OAUTH_PORT || option('--port') || 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535) die('Port must be between 1024 and 65535.');
const sender = process.env.GOOGLE_WORKSPACE_SENDER || option('--sender') || 'sam@nexphaselabs.net';
const redirectUri = `http://127.0.0.1:${port}/callback`;

function ask(prompt, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    if (hidden) {
      const write = rl._writeToOutput.bind(rl);
      rl._writeToOutput = (text) => write(text.includes(prompt) ? text : '');
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (hidden) process.stderr.write('\n');
      resolve(answer.trim());
    });
  });
}

async function post(params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${data.error ?? ''} ${data.error_description ?? ''}`.trim());
  }
  return data;
}

const page = (message) =>
  `<!doctype html><meta charset="utf-8"><title>NexPhase mail consent</title><body style="font:16px system-ui;padding:3rem"><p>${message}</p></body>`;

const clientId = process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_ID || (await ask('OAuth client ID: '));
const clientSecret =
  process.env.GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET || (await ask('OAuth client secret (hidden): ', { hidden: true }));
if (!clientId || !clientSecret) die('Both the client id and the client secret are required.');

const state = randomBytes(16).toString('hex');
const authUrl = new URL(AUTH_URL);
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'false',
  login_hint: sender,
  state,
}).toString();

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    const finish = (status, message, outcome) => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(page(message));
      server.close();
      outcome();
    };
    if (url.searchParams.get('state') !== state) {
      finish(400, 'State mismatch. Run the script again.', () => reject(new Error('state mismatch')));
      return;
    }
    const refused = url.searchParams.get('error');
    if (refused) {
      finish(200, `Google refused: ${refused}. You can close this tab.`, () => reject(new Error(refused)));
      return;
    }
    const granted = url.searchParams.get('code');
    if (!granted) {
      finish(400, 'No code in the callback.', () => reject(new Error('no code')));
      return;
    }
    finish(200, 'Consent received. You can close this tab and return to the terminal.', () => resolve(granted));
  });
  server.on('error', (error) => reject(new Error(`Could not listen on ${redirectUri}: ${error.message}`)));
  server.listen(port, '127.0.0.1', () => {
    log(`\nListening on ${redirectUri}`);
    log(`Sign in as ${sender} and approve "Send email on your behalf".`);
    log(`If Google shows redirect_uri_mismatch, add exactly ${redirectUri} to the client's Authorized redirect URIs.\n`);
    log(authUrl.toString());
    log('');
    if (process.platform === 'darwin') spawn('open', [authUrl.toString()], { stdio: 'ignore', detached: true }).unref();
  });
  setTimeout(() => {
    server.close();
    reject(new Error(`No consent within ${TIMEOUT_MS / 60000} minutes.`));
  }, TIMEOUT_MS).unref();
}).catch((error) => die(`Consent did not complete: ${error.message}`));

let tokens;
try {
  tokens = await post({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
} catch (error) {
  die(`Code exchange failed: ${error.message}`);
}
if (!tokens.refresh_token) {
  die(
    'Google returned no refresh_token. This happens when consent was granted before without prompt=consent. ' +
      `Revoke the app at https://myaccount.google.com/permissions (signed in as ${sender}) and run again.`,
  );
}

// Prove it the way the Worker will use it: a refresh must return an access
// token carrying exactly the send scope (docs/GOOGLE_WORKSPACE_EMAIL_SETUP.md).
let proof;
try {
  proof = await post({
    refresh_token: tokens.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
} catch (error) {
  die(`The new refresh token could not be exchanged: ${error.message}`);
}
const scopes = String(proof.scope ?? '').split(' ').filter(Boolean);
if (!proof.access_token || !scopes.includes(SCOPE)) die(`Refresh succeeded but the scope is wrong: ${scopes.join(' ') || '(none)'}`);
if (scopes.length !== 1) log(`Warning: the grant carries more than the send scope: ${scopes.join(' ')}`);
log(`Refresh OK for ${sender}. Scope: ${scopes.join(' ')}. Access token lifetime ${proof.expires_in}s.`);

if (!put) {
  process.stdout.write(`${tokens.refresh_token}\n`);
  log('\nThat line is the refresh token. Paste it into `wrangler secret put GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN` and nowhere else.');
  process.exit(0);
}

const wranglerArgs = ['wrangler', 'secret', 'put', 'GOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN'];
if (env === 'staging') wranglerArgs.push('--env', 'staging');
log(`\nRunning: npx ${wranglerArgs.join(' ')}  (token supplied on stdin)`);
const wrangler = spawn('npx', wranglerArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
wrangler.stdin.end(`${tokens.refresh_token}\n`);
wrangler.on('exit', (status) => {
  if (status === 0) log(`\nGOOGLE_WORKSPACE_OAUTH_REFRESH_TOKEN is set for ${env}. Also set, by hand:\n  npx wrangler secret put GOOGLE_WORKSPACE_OAUTH_CLIENT_ID${env === 'staging' ? ' --env staging' : ''}\n  npx wrangler secret put GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET${env === 'staging' ? ' --env staging' : ''}\n  npx wrangler secret put GOOGLE_WORKSPACE_SENDER${env === 'staging' ? ' --env staging' : ''}   (value: ${sender})`);
  process.exit(status ?? 1);
});
