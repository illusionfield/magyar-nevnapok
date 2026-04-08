import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process, {stdin as input, stdout as output} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {authenticate} from '@google-cloud/local-auth';
import {google} from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const OAUTH_CONFIG_PATH = path.join(process.cwd(), '.google-calendar-oauth.local.json');
const LEGACY_CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const DEFAULT_REDIRECT_URI = 'http://localhost';
const DEFAULT_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DEFAULT_CERTS_URI = 'https://www.googleapis.com/oauth2/v1/certs';
const CONSOLE_PROJECT_URL = 'https://console.cloud.google.com/projectcreate';
const CONSOLE_ENABLE_CALENDAR_API_URL =
  'https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com';
const CONSOLE_BRANDING_URL = 'https://console.cloud.google.com/auth/branding';
const CONSOLE_AUDIENCE_URL = 'https://console.cloud.google.com/auth/audience';
const CONSOLE_CLIENTS_URL = 'https://console.cloud.google.com/auth/clients';
const PAGE_SIZE = 2500;
const MAX_RETRIES = 5;
const SEND_UPDATES = 'none';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const status = error?.response?.status;
  const reason = error?.response?.data?.error?.errors?.[0]?.reason;

  if (status === 429) {
    return true;
  }

  if (status >= 500) {
    return true;
  }

  if (status === 403) {
    return [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'quotaExceeded',
      'backendError',
    ].includes(reason);
  }

  return false;
}

function getCalendarName(calendarItem) {
  return calendarItem.summary?.trim() || '(untitled calendar)';
}

function formatCalendarLine(calendarItem, index) {
  const details = [calendarItem.accessRole ?? 'unknown'];

  if (calendarItem.primary) {
    details.unshift('primary');
  }

  return `${index + 1}. ${getCalendarName(calendarItem)} [${details.join(', ')}]`;
}

function isLocalhostRedirectUri(value) {
  try {
    const redirectUri = new URL(value);
    return redirectUri.protocol === 'http:' && redirectUri.hostname === 'localhost';
  } catch {
    return false;
  }
}

function readOAuthConfigFile(configPath, label) {
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      reason: `${label} does not exist yet.`,
    };
  }

  const stats = fs.statSync(configPath);

  if (stats.size === 0) {
    return {
      ok: false,
      reason: `${label} exists, but it is empty.`,
    };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const config = parsed.installed || parsed.web;

    if (!config) {
      return {
        ok: false,
        reason: `${label} does not contain an installed or web OAuth client.`,
      };
    }

    if (!config.client_id || !config.client_secret) {
      return {
        ok: false,
        reason: `${label} is missing client_id or client_secret.`,
      };
    }

    if (!Array.isArray(config.redirect_uris) || config.redirect_uris.length === 0) {
      return {
        ok: false,
        reason: `${label} is missing redirect_uris.`,
      };
    }

    if (!isLocalhostRedirectUri(config.redirect_uris[0])) {
      return {
        ok: false,
        reason: `${label} must use an http://localhost redirect URI for local OAuth.`,
      };
    }

    return {
      ok: true,
      config: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `${label} could not be parsed: ${error.message}`,
    };
  }
}

function readOAuthConfig() {
  return readOAuthConfigFile(OAUTH_CONFIG_PATH, 'local OAuth config');
}

function readLegacyCredentialsConfig() {
  return readOAuthConfigFile(LEGACY_CREDENTIALS_PATH, 'legacy credentials.json');
}

function readTokenConfig() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return {
      ok: false,
      reason: 'token.json does not exist yet.',
    };
  }

  const stats = fs.statSync(TOKEN_PATH);

  if (stats.size === 0) {
    return {
      ok: false,
      reason: 'token.json exists, but it is empty.',
    };
  }

  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.refresh_token && !parsed.access_token) {
      return {
        ok: false,
        reason: 'token.json does not contain an access_token or refresh_token.',
      };
    }

    return {
      ok: true,
      token: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `token.json could not be parsed: ${error.message}`,
    };
  }
}

async function promptNonEmpty(rl, label, validate) {
  while (true) {
    const value = (await rl.question(label)).trim();

    if (!value) {
      console.log('This value cannot be empty.');
      continue;
    }

    if (validate && !validate(value)) {
      continue;
    }

    return value;
  }
}

async function promptChoice(rl, title, options) {
  console.log('');
  console.log(title);

  for (let index = 0; index < options.length; index += 1) {
    console.log(`${index + 1}. ${options[index]}`);
  }

  while (true) {
    const answer = (await rl.question(`Choose 1-${options.length}, or q to cancel: `)).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    const selectedIndex = Number.parseInt(answer, 10);

    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.length) {
      return selectedIndex - 1;
    }

    console.log('Invalid selection. Enter one of the listed numbers.');
  }
}

function openUrlInBrowser(url) {
  let result;

  if (process.platform === 'darwin') {
    result = spawnSync('open', [url], {stdio: 'ignore'});
  } else if (process.platform === 'win32') {
    result = spawnSync('cmd', ['/c', 'start', '', url], {stdio: 'ignore', shell: false});
  } else {
    result = spawnSync('xdg-open', [url], {stdio: 'ignore'});
  }

  if (result.error || result.status !== 0) {
    console.log('Could not open the browser automatically.');
    console.log(`Open this URL manually: ${url}`);
    return false;
  }

  console.log(`Opened: ${url}`);
  return true;
}

function normalizeLocalPath(inputValue) {
  let value = inputValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1);
  }

  value = value.replace(/\\ /g, ' ');

  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(value);
}

function buildOAuthConfig({clientId, clientSecret, projectId}) {
  const trimmedProjectId = projectId.trim();

  return {
    installed: {
      client_id: clientId,
      client_secret: clientSecret,
      project_id: trimmedProjectId || 'google-calendar-cleanup',
      auth_uri: DEFAULT_AUTH_URI,
      token_uri: DEFAULT_TOKEN_URI,
      auth_provider_x509_cert_url: DEFAULT_CERTS_URI,
      redirect_uris: [DEFAULT_REDIRECT_URI],
    },
  };
}

function createOAuthClient(credentialsConfig) {
  const config = credentialsConfig.installed || credentialsConfig.web;

  return new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris[0]
  );
}

function saveToken(tokenPayload) {
  if (!tokenPayload || typeof tokenPayload !== 'object') {
    return;
  }

  const existing = readTokenConfig();
  const mergedToken = {
    ...(existing.ok ? existing.token : {}),
    ...tokenPayload,
  };

  fs.writeFileSync(TOKEN_PATH, `${JSON.stringify(mergedToken, null, 2)}\n`, 'utf8');
}

function attachTokenPersistence(auth) {
  if (typeof auth.on !== 'function') {
    return;
  }

  auth.on('tokens', (tokens) => {
    saveToken(tokens);
  });
}

function writeOAuthConfig(config) {
  fs.writeFileSync(OAUTH_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function promptForManualOAuthConfig(rl) {
  console.log('');
  console.log('Manual OAuth client setup');
  console.log('Paste the values from your Google OAuth Desktop client.');
  console.log('');

  const clientId = await promptNonEmpty(
    rl,
    'Google OAuth client ID: ',
    (value) => {
      if (value.endsWith('.apps.googleusercontent.com')) {
        return true;
      }

      console.log('This does not look like a Google OAuth client ID.');
      return false;
    }
  );
  const clientSecret = await promptNonEmpty(rl, 'Google OAuth client secret: ');
  const projectId = (await rl.question('Project ID (optional): ')).trim();

  return buildOAuthConfig({
    clientId,
    clientSecret,
    projectId,
  });
}

async function promptForOAuthConfigFromJsonFile(rl) {
  console.log('');
  console.log('Import OAuth client from downloaded JSON');
  console.log('Download the OAuth client JSON from Google Cloud, then paste the file path here.');
  console.log('Tip: on macOS you can drag the file into the terminal to paste the path.');

  while (true) {
    const answer = (await rl.question('JSON file path, or q to cancel: ')).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    if (!answer) {
      console.log('The file path cannot be empty.');
      continue;
    }

    const filePath = normalizeLocalPath(answer);
    const parsed = readOAuthConfigFile(filePath, 'downloaded OAuth JSON');

    if (!parsed.ok) {
      console.log(parsed.reason);
      continue;
    }

    return parsed.config;
  }
}

async function runBrowserSetupStep(rl, {title, url, instructions}) {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));

  for (const line of instructions) {
    console.log(`- ${line}`);
  }

  console.log('');
  console.log(`URL: ${url}`);

  const openAnswer = (await rl.question(
    'Press Enter to open this page, type skip to keep the browser closed, or q to cancel: '
  )).trim().toLowerCase();

  if (openAnswer === 'q') {
    return false;
  }

  if (openAnswer !== 'skip') {
    openUrlInBrowser(url);
  }

  const doneAnswer = (await rl.question(
    'Press Enter after you finish this step, or q to cancel: '
  )).trim().toLowerCase();

  return doneAnswer !== 'q';
}

async function runGuidedBrowserOAuthSetup(rl) {
  console.log('');
  console.log('Guided Google sign-in setup');
  console.log('---------------------------');
  console.log('This wizard will open the Google Cloud pages you need, one step at a time.');

  const audienceChoice = await promptChoice(
    rl,
    'Who will use this Google sign-in client?',
    [
      'Only me or a few regular Google accounts, including Gmail (Recommended)',
      'Only users inside my Google Workspace organization',
    ]
  );

  if (audienceChoice === null) {
    return null;
  }

  const usesExternalAudience = audienceChoice === 0;
  let testUserEmail = '';

  if (usesExternalAudience) {
    testUserEmail = (await rl.question(
      'Google email to add as a test user later (optional): '
    )).trim();
  }

  const steps = [
    {
      title: 'Step 1: Create or select a Google Cloud project',
      url: CONSOLE_PROJECT_URL,
      instructions: [
        'Create a new project, or use the project picker to select an existing project.',
        'Keep that project selected for all following steps.',
      ],
    },
    {
      title: 'Step 2: Enable the Google Calendar API',
      url: CONSOLE_ENABLE_CALENDAR_API_URL,
      instructions: [
        'Make sure the correct project is selected.',
        'Click Enable for the Google Calendar API.',
      ],
    },
    {
      title: 'Step 3: Configure the Google Auth branding screen',
      url: CONSOLE_BRANDING_URL,
      instructions: [
        'Click Get Started if Google asks to configure the auth platform.',
        'Enter any app name you want.',
        'Use your own email for support and contact details.',
        usesExternalAudience
          ? 'Choose External as the audience type.'
          : 'Choose Internal as the audience type.',
      ],
    },
  ];

  if (usesExternalAudience) {
    steps.push({
      title: 'Step 4: Add yourself as a test user',
      url: CONSOLE_AUDIENCE_URL,
      instructions: [
        'Under Test users, click Add users.',
        testUserEmail
          ? `Add this email as a test user: ${testUserEmail}`
          : 'Add the same Google account that you will use for the later sign-in.',
      ],
    });
  }

  steps.push({
    title: usesExternalAudience
      ? 'Step 5: Create the Desktop app OAuth client'
      : 'Step 4: Create the Desktop app OAuth client',
    url: CONSOLE_CLIENTS_URL,
    instructions: [
      'Click Create Client.',
      'Choose Desktop app.',
      'After creation, download the JSON file.',
    ],
  });

  for (const step of steps) {
    const finished = await runBrowserSetupStep(rl, step);

    if (!finished) {
      return null;
    }
  }

  const importChoice = await promptChoice(
    rl,
    'How do you want to import the new OAuth client into this tool?',
    [
      'Use the downloaded JSON file (Recommended)',
      'Enter the client ID and client secret manually',
    ]
  );

  if (importChoice === null) {
    return null;
  }

  if (importChoice === 0) {
    return promptForOAuthConfigFromJsonFile(rl);
  }

  return promptForManualOAuthConfig(rl);
}

async function ensureOAuthConfig(rl) {
  const existing = readOAuthConfig();

  if (existing.ok) {
    return existing.config;
  }

  const legacy = readLegacyCredentialsConfig();

  if (legacy.ok) {
    writeOAuthConfig(legacy.config);
    console.log(`Migrated legacy credentials.json to ${OAUTH_CONFIG_PATH}`);
    return legacy.config;
  }

  console.log('');
  console.log('Local Google sign-in setup');
  console.log('--------------------------');
  console.log(`No usable local OAuth config found: ${existing.reason}`);
  console.log(`A one-time local setup file will be created at ${OAUTH_CONFIG_PATH}.`);

  const setupChoice = await promptChoice(
    rl,
    'How do you want to set up Google sign-in for this tool?',
    [
      'Guide me step by step in the browser (Recommended)',
      'Import an already-downloaded OAuth JSON file',
      'Enter the client ID and client secret manually',
    ]
  );

  if (setupChoice === null) {
    return null;
  }

  let config;

  if (setupChoice === 0) {
    config = await runGuidedBrowserOAuthSetup(rl);
  } else if (setupChoice === 1) {
    config = await promptForOAuthConfigFromJsonFile(rl);
  } else {
    config = await promptForManualOAuthConfig(rl);
  }

  if (!config) {
    return null;
  }

  writeOAuthConfig(config);
  console.log(`Generated local OAuth config at ${OAUTH_CONFIG_PATH}`);

  return config;
}

async function createCalendarClient(rl) {
  const oauthConfig = await ensureOAuthConfig(rl);

  if (!oauthConfig) {
    return null;
  }

  const cachedToken = readTokenConfig();

  if (cachedToken.ok) {
    try {
      const auth = createOAuthClient(oauthConfig);
      attachTokenPersistence(auth);
      auth.setCredentials(cachedToken.token);
      await auth.getAccessToken();

      console.log(`Using cached OAuth token from ${TOKEN_PATH}`);

      return google.calendar({
        version: 'v3',
        auth,
      });
    } catch (error) {
      console.log(`Cached token could not be used: ${error.message}`);
      console.log('Falling back to browser OAuth...');
    }
  }

  console.log('Opening browser for Google sign-in...');

  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: OAUTH_CONFIG_PATH,
  });
  attachTokenPersistence(auth);
  saveToken(auth.credentials);
  console.log(`Saved OAuth token cache at ${TOKEN_PATH}`);

  return google.calendar({
    version: 'v3',
    auth,
  });
}

async function listCalendars(calendar) {
  const calendars = [];
  let pageToken;

  do {
    const response = await calendar.calendarList.list({
      maxResults: 250,
      pageToken,
      fields: 'items(id,summary,primary,accessRole),nextPageToken',
    });

    for (const item of response.data.items ?? []) {
      if (!item?.id) {
        continue;
      }

      calendars.push(item);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  calendars.sort((left, right) => {
    if (left.primary && !right.primary) {
      return -1;
    }

    if (!left.primary && right.primary) {
      return 1;
    }

    return getCalendarName(left).localeCompare(getCalendarName(right), 'hu');
  });

  return calendars;
}

async function promptForCalendar(rl, calendars) {
  console.log('');
  console.log('Available calendars:');

  for (let index = 0; index < calendars.length; index += 1) {
    const calendarItem = calendars[index];
    console.log(formatCalendarLine(calendarItem, index));
    console.log(`   ${calendarItem.id}`);
  }

  while (true) {
    const answer = (await rl.question(`\nSelect a calendar (1-${calendars.length}, or q to quit): `)).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    const selectedIndex = Number.parseInt(answer, 10);

    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= calendars.length) {
      return calendars[selectedIndex - 1];
    }

    console.log('Invalid selection. Enter one of the listed numbers.');
  }
}

async function promptForAction(rl, calendarItem) {
  console.log(`\nSelected calendar: ${getCalendarName(calendarItem)}`);
  console.log('Choose an action:');
  console.log('1. Delete all events');
  console.log('2. Delete calendar');

  while (true) {
    const answer = (await rl.question('Action (1-2, or q to quit): ')).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    if (answer === '1') {
      return 'delete-events';
    }

    if (answer === '2') {
      return 'delete-calendar';
    }

    console.log('Invalid selection. Enter 1 or 2.');
  }
}

async function confirmAction(rl, action, calendarItem, extraLine) {
  const calendarName = getCalendarName(calendarItem);
  const confirmationToken = action === 'delete-events'
    ? 'DELETE EVENTS'
    : 'DELETE CALENDAR';

  console.log('');
  console.log(`Calendar: ${calendarName}`);
  console.log(`Calendar ID: ${calendarItem.id}`);

  if (extraLine) {
    console.log(extraLine);
  }

  console.log(`Type ${confirmationToken} to confirm, or anything else to cancel.`);
  const answer = (await rl.question('Confirmation: ')).trim();

  return answer === confirmationToken;
}

async function listAllEventIds(calendar, calendarId) {
  const eventIds = [];
  let pageToken;

  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: PAGE_SIZE,
      pageToken,
      showDeleted: false,
      singleEvents: false,
      fields: 'items(id,status),nextPageToken',
    });

    for (const item of response.data.items ?? []) {
      if (!item?.id) {
        continue;
      }

      if (item.status === 'cancelled') {
        continue;
      }

      eventIds.push(item.id);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return eventIds;
}

async function deleteEventWithRetry(calendar, calendarId, eventId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: SEND_UPDATES,
      });
      return;
    } catch (error) {
      const status = error?.response?.status;
      const reason = error?.response?.data?.error?.errors?.[0]?.reason;

      if (status === 404 || status === 410) {
        console.log(`Already deleted: ${eventId}`);
        return;
      }

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const waitMs = 1000 * (2 ** (attempt - 1));
      console.log(
        `Retry ${attempt}/${MAX_RETRIES} for ${eventId} after ${waitMs} ms ` +
        `(status=${status ?? 'unknown'}, reason=${reason ?? 'unknown'})`
      );
      await sleep(waitMs);
    }
  }
}

function assertEventDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? 'unknown';

  if (!['writer', 'owner'].includes(accessRole)) {
    throw new Error(
      `Deleting events requires writer or owner access. Current accessRole: ${accessRole}`
    );
  }
}

function assertCalendarDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? 'unknown';

  if (calendarItem.primary) {
    throw new Error('The primary calendar cannot be deleted with this script.');
  }

  if (accessRole !== 'owner') {
    throw new Error(
      `Deleting a calendar requires owner access. Current accessRole: ${accessRole}`
    );
  }
}

async function deleteEventIds(calendar, calendarId, eventIds) {
  if (eventIds.length === 0) {
    console.log('No active events found. Nothing to delete.');
    return;
  }

  for (let index = 0; index < eventIds.length; index += 1) {
    await deleteEventWithRetry(calendar, calendarId, eventIds[index]);

    const current = index + 1;
    if (current % 50 === 0 || current === eventIds.length) {
      console.log(`Deleted ${current}/${eventIds.length}`);
    }
  }

  console.log(`Done. Deleted ${eventIds.length} event(s).`);
}

async function deleteCalendar(calendar, calendarItem) {
  assertCalendarDeleteAccess(calendarItem);

  await calendar.calendars.delete({
    calendarId: calendarItem.id,
  });

  console.log(`Done. Deleted calendar: ${calendarItem.id}`);
}

async function main() {
  const rl = createInterface({input, output});

  try {
    const calendar = await createCalendarClient(rl);

    if (!calendar) {
      console.log('Cancelled.');
      return;
    }

    const calendars = await listCalendars(calendar);

    if (calendars.length === 0) {
      console.log('No calendars found for the authenticated account.');
      return;
    }

    const selectedCalendar = await promptForCalendar(rl, calendars);

    if (!selectedCalendar) {
      console.log('Cancelled.');
      return;
    }

    const action = await promptForAction(rl, selectedCalendar);

    if (!action) {
      console.log('Cancelled.');
      return;
    }

    if (action === 'delete-events') {
      assertEventDeleteAccess(selectedCalendar);

      const eventIds = await listAllEventIds(calendar, selectedCalendar.id);
      const confirmed = await confirmAction(
        rl,
        action,
        selectedCalendar,
        `Events to delete: ${eventIds.length}`
      );

      if (!confirmed) {
        console.log('Cancelled. No events were deleted.');
        return;
      }

      await deleteEventIds(calendar, selectedCalendar.id, eventIds);
      return;
    }

    const confirmed = await confirmAction(rl, action, selectedCalendar);

    if (!confirmed) {
      console.log('Cancelled. The calendar was not deleted.');
      return;
    }

    await deleteCalendar(calendar, selectedCalendar);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Failed:', error?.message || error);

  if (error?.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  }

  process.exitCode = 1;
});
