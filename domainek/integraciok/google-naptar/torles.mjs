/**
 * domainek/integraciok/google-naptar/torles.mjs
 * Google Naptár adminisztratív törlő folyamatának elsődleges helye.
 */
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

/**
 * A `sleep` egyszerű várakozó Promise-t ad vissza.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A `isRetryableError` ellenőrzi a kapcsolódó feltételt.
 */
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

/**
 * A `getCalendarName` emberileg olvasható naptárnevet ad vissza.
 */
function getCalendarName(calendarItem) {
  return calendarItem.summary?.trim() || '(névtelen naptár)';
}

/**
 * A `formatCalendarLine` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatCalendarLine(calendarItem, index) {
  const details = [calendarItem.accessRole ?? 'ismeretlen'];

  if (calendarItem.primary) {
    details.unshift('elsődleges');
  }

  return `${index + 1}. ${getCalendarName(calendarItem)} [${details.join(', ')}]`;
}

/**
 * A `isLocalhostRedirectUri` ellenőrzi a kapcsolódó feltételt.
 */
function isLocalhostRedirectUri(value) {
  try {
    const redirectUri = new URL(value);
    return redirectUri.protocol === 'http:' && redirectUri.hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * A `readOAuthConfigFile` betölti a szükséges adatot.
 */
function readOAuthConfigFile(configPath, label) {
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      reason: `${label} még nem létezik.`,
    };
  }

  const stats = fs.statSync(configPath);

  if (stats.size === 0) {
    return {
      ok: false,
      reason: `${label} létezik, de üres.`,
    };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const config = parsed.installed || parsed.web;

    if (!config) {
      return {
        ok: false,
        reason: `${label} nem tartalmaz telepített vagy webes OAuth-klienst.`,
      };
    }

    if (!config.client_id || !config.client_secret) {
      return {
        ok: false,
        reason: `${label} nem tartalmaz client_id vagy client_secret mezőt.`,
      };
    }

    if (!Array.isArray(config.redirect_uris) || config.redirect_uris.length === 0) {
      return {
        ok: false,
        reason: `${label} nem tartalmaz redirect_uris mezőt.`,
      };
    }

    if (!isLocalhostRedirectUri(config.redirect_uris[0])) {
      return {
        ok: false,
        reason: `${label} helyi OAuth-hoz http://localhost átirányítási URI-t kell használnia.`,
      };
    }

    return {
      ok: true,
      config: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `${label} nem dolgozható fel: ${error.message}`,
    };
  }
}

/**
 * A `readOAuthConfig` betölti a szükséges adatot.
 */
function readOAuthConfig() {
  return readOAuthConfigFile(OAUTH_CONFIG_PATH, 'helyi OAuth konfiguráció');
}

/**
 * A `readLegacyCredentialsConfig` betölti a szükséges adatot.
 */
function readLegacyCredentialsConfig() {
  return readOAuthConfigFile(LEGACY_CREDENTIALS_PATH, 'legacy credentials.json');
}

/**
 * A `readTokenConfig` betölti a szükséges adatot.
 */
function readTokenConfig() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return {
      ok: false,
      reason: 'token.json még nem létezik.',
    };
  }

  const stats = fs.statSync(TOKEN_PATH);

  if (stats.size === 0) {
    return {
      ok: false,
      reason: 'token.json létezik, de üres.',
    };
  }

  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.refresh_token && !parsed.access_token) {
      return {
        ok: false,
        reason: 'A token.json nem tartalmaz access_token vagy refresh_token mezőt.',
      };
    }

    return {
      ok: true,
      token: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `token.json nem dolgozható fel: ${error.message}`,
    };
  }
}

/**
 * A `promptNonEmpty` interaktív választ kér a felhasználótól.
 */
async function promptNonEmpty(rl, label, validate) {
  while (true) {
    const value = (await rl.question(label)).trim();

    if (!value) {
      console.log('Ez az érték nem lehet üres.');
      continue;
    }

    if (validate && !validate(value)) {
      continue;
    }

    return value;
  }
}

/**
 * A `promptChoice` interaktív választ kér a felhasználótól.
 */
async function promptChoice(rl, title, options) {
  console.log('');
  console.log(title);

  for (let index = 0; index < options.length; index += 1) {
    console.log(`${index + 1}. ${options[index]}`);
  }

  while (true) {
    const answer = (await rl.question(`Válassz 1-${options.length} között, vagy q a megszakításhoz: `)).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    const selectedIndex = Number.parseInt(answer, 10);

    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.length) {
      return selectedIndex - 1;
    }

    console.log('Érvénytelen választás. Add meg a felsorolt sorszámok egyikét.');
  }
}

/**
 * A `openUrlInBrowser` megpróbálja megnyitni a kapcsolódó erőforrást.
 */
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
    console.log('A böngésző nem nyitható meg automatikusan.');
    console.log(`Nyisd meg kézzel ezt az URL-t: ${url}`);
    return false;
  }

  console.log(`Megnyitva: ${url}`);
  return true;
}

/**
 * A `normalizeLocalPath` normalizálja a megadott értéket.
 */
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

/**
 * A `buildOAuthConfig` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `createOAuthClient` OAuth2 klienst hoz létre a helyi konfiguráció alapján.
 */
function createOAuthClient(credentialsConfig) {
  const config = credentialsConfig.installed || credentialsConfig.web;

  return new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    config.redirect_uris[0]
  );
}

/**
 * A `saveToken` elmenti vagy kiírja a kapcsolódó adatot.
 */
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

/**
 * A `attachTokenPersistence` rákapcsolja a szükséges eseménykezelést vagy mellékhatást.
 */
function attachTokenPersistence(auth) {
  if (typeof auth.on !== 'function') {
    return;
  }

  auth.on('tokens', (tokens) => {
    saveToken(tokens);
  });
}

/**
 * A `writeOAuthConfig` elmenti vagy kiírja a kapcsolódó adatot.
 */
function writeOAuthConfig(config) {
  fs.writeFileSync(OAUTH_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * A `promptForManualOAuthConfig` interaktív választ kér a felhasználótól.
 */
async function promptForManualOAuthConfig(rl) {
  console.log('');
  console.log('Kézi OAuth-kliens beállítás');
  console.log('Illeszd be a Google OAuth asztali kliensed adatait.');
  console.log('');

  const clientId = await promptNonEmpty(
    rl,
    'Google OAuth kliensazonosító: ',
    (value) => {
      if (value.endsWith('.apps.googleusercontent.com')) {
        return true;
      }

      console.log('Ez nem tűnik Google OAuth kliensazonosítónak.');
      return false;
    }
  );
  const clientSecret = await promptNonEmpty(rl, 'Google OAuth kliens titok: ');
  const projectId = (await rl.question('Projektazonosító (opcionális): ')).trim();

  return buildOAuthConfig({
    clientId,
    clientSecret,
    projectId,
  });
}

/**
 * A `promptForOAuthConfigFromJsonFile` interaktív választ kér a felhasználótól.
 */
async function promptForOAuthConfigFromJsonFile(rl) {
  console.log('');
  console.log('OAuth kliens importálása letöltött JSON-ból');
  console.log('Töltsd le a Google Cloudból az OAuth kliens JSON-t, majd illeszd be ide a fájl útvonalát.');
  console.log('Tipp: macOS alatt a fájlt a terminálba húzva az útvonal automatikusan beilleszthető.');

  while (true) {
    const answer = (await rl.question('JSON fájl útvonala, vagy q a megszakításhoz: ')).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    if (!answer) {
      console.log('A fájlútvonal nem lehet üres.');
      continue;
    }

    const filePath = normalizeLocalPath(answer);
    const parsed = readOAuthConfigFile(filePath, 'letöltött OAuth JSON');

    if (!parsed.ok) {
      console.log(parsed.reason);
      continue;
    }

    return parsed.config;
  }
}

/**
 * A `runBrowserSetupStep` végigvezeti a felhasználót egy böngészős OAuth-előkészítő lépésen.
 */
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
    'Nyomj Entert az oldal megnyitásához, írd be hogy skip, ha zárva tartanád a böngészőt, vagy q a megszakításhoz: '
  )).trim().toLowerCase();

  if (openAnswer === 'q') {
    return false;
  }

  if (openAnswer !== 'skip') {
    openUrlInBrowser(url);
  }

  const doneAnswer = (await rl.question(
    'Nyomj Entert a lépés befejezése után, vagy q a megszakításhoz: '
  )).trim().toLowerCase();

  return doneAnswer !== 'q';
}

/**
 * A `runGuidedBrowserOAuthSetup` lépésről lépésre végigvezeti a felhasználót a böngészős OAuth-beállításon.
 */
async function runGuidedBrowserOAuthSetup(rl) {
  console.log('');
  console.log('Vezetett Google-bejelentkezési beállítás');
  console.log('---------------------------');
  console.log('Ez a varázsló lépésről lépésre megnyitja a szükséges Google Cloud oldalakat.');

  const audienceChoice = await promptChoice(
    rl,
    'Ki fogja használni ezt a Google-bejelentkezési klienst?',
    [
      'Csak én vagy néhány normál Google-fiók, beleértve a Gmailt is (Ajánlott)',
      'Csak a Google Workspace szervezetem felhasználói',
    ]
  );

  if (audienceChoice === null) {
    return null;
  }

  const usesExternalAudience = audienceChoice === 0;
  let testUserEmail = '';

  if (usesExternalAudience) {
    testUserEmail = (await rl.question(
      'A később tesztfelhasználóként felveendő Google e-mail-cím (opcionális): '
    )).trim();
  }

  const steps = [
    {
      title: '1. lépés: Google Cloud projekt létrehozása vagy kiválasztása',
      url: CONSOLE_PROJECT_URL,
      instructions: [
        'Hozz létre új projektet, vagy a projektválasztóval jelölj ki egy meglévőt.',
        'A következő lépésekhez is ez a projekt maradjon kijelölve.',
      ],
    },
    {
      title: '2. lépés: A Google Calendar API engedélyezése',
      url: CONSOLE_ENABLE_CALENDAR_API_URL,
      instructions: [
        'Győződj meg róla, hogy a megfelelő projekt van kijelölve.',
        'Kattints az Engedélyezés gombra a Google Calendar API-nál.',
      ],
    },
    {
      title: '3. lépés: A Google Auth arculati képernyő beállítása',
      url: CONSOLE_BRANDING_URL,
      instructions: [
        'Ha a Google a hitelesítési platform beállítását kéri, kattints az Első lépések gombra.',
        'Adj meg tetszőleges alkalmazásnevet.',
        'A támogatási és kapcsolattartási mezőkbe a saját e-mail-címedet írd.',
        usesExternalAudience
          ? 'Célközönségként az External típust válaszd.'
          : 'Célközönségként az Internal típust válaszd.',
      ],
    },
  ];

  if (usesExternalAudience) {
    steps.push({
      title: '4. lépés: Saját fiók felvétele tesztfelhasználóként',
      url: CONSOLE_AUDIENCE_URL,
      instructions: [
        'A Test users résznél kattints az Add users gombra.',
        testUserEmail
          ? `Vedd fel tesztfelhasználóként ezt az e-mail-címet: ${testUserEmail}`
          : 'Add hozzá ugyanazt a Google-fiókot, amellyel később be fogsz jelentkezni.',
      ],
    });
  }

  steps.push({
    title: usesExternalAudience
      ? '5. lépés: Az asztali alkalmazás OAuth kliensének létrehozása'
      : '4. lépés: Az asztali alkalmazás OAuth kliensének létrehozása',
    url: CONSOLE_CLIENTS_URL,
    instructions: [
      'Kattints a Create Client gombra.',
      'Válaszd a Desktop app típust.',
      'Létrehozás után töltsd le a JSON fájlt.',
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
    'Hogyan szeretnéd importálni az új OAuth klienst ebbe az eszközbe?',
    [
      'A letöltött JSON fájl használata (Ajánlott)',
      'A kliensazonosító és a kliens titok kézi megadása',
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

/**
 * Az `ensureOAuthConfig` gondoskodik használható helyi OAuth-konfigurációról.
 */
async function ensureOAuthConfig(rl) {
  const existing = readOAuthConfig();

  if (existing.ok) {
    return existing.config;
  }

  const legacy = readLegacyCredentialsConfig();

  if (legacy.ok) {
    writeOAuthConfig(legacy.config);
    console.log(`A legacy credentials.json át lett költöztetve ide: ${OAUTH_CONFIG_PATH}`);
    return legacy.config;
  }

  console.log('');
  console.log('Helyi Google-bejelentkezés beállítása');
  console.log('--------------------------');
  console.log(`Nem található használható helyi OAuth-konfiguráció: ${existing.reason}`);
  console.log(`Egyszeri helyi beállítási fájl jön létre itt: ${OAUTH_CONFIG_PATH}.`);

  const setupChoice = await promptChoice(
    rl,
    'Hogyan szeretnéd beállítani a Google-bejelentkezést ehhez az eszközhöz?',
    [
      'Vezess végig lépésről lépésre a böngészőben (Ajánlott)',
      'Már letöltött OAuth JSON fájl importálása',
      'A kliensazonosító és a kliens titok kézi megadása',
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
  console.log(`A helyi OAuth-konfiguráció létrejött itt: ${OAUTH_CONFIG_PATH}`);

  return config;
}

/**
 * A `createCalendarClient` hitelesített Google Calendar API klienst hoz létre.
 */
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

      console.log(`Gyorsítótárazott OAuth token használata innen: ${TOKEN_PATH}`);

      return google.calendar({
        version: 'v3',
        auth,
      });
    } catch (error) {
      console.log(`A gyorsítótárazott token nem használható: ${error.message}`);
      console.log('Visszaváltás böngészős OAuth-folyamatra...');
    }
  }

  console.log('Böngésző megnyitása a Google-bejelentkezéshez...');

  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: OAUTH_CONFIG_PATH,
  });
  attachTokenPersistence(auth);
  saveToken(auth.credentials);
  console.log(`Az OAuth token gyorsítótára ide lett mentve: ${TOKEN_PATH}`);

  return google.calendar({
    version: 'v3',
    auth,
  });
}

/**
 * A `listCalendars` lekéri és rendezve visszaadja az elérhető naptárakat.
 */
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

/**
 * A `promptForCalendar` interaktív választ kér a felhasználótól.
 */
async function promptForCalendar(rl, calendars) {
  console.log('');
  console.log('Elérhető naptárak:');

  for (let index = 0; index < calendars.length; index += 1) {
    const calendarItem = calendars[index];
    console.log(formatCalendarLine(calendarItem, index));
    console.log(`   ${calendarItem.id}`);
  }

  while (true) {
    const answer = (await rl.question(`\nVálassz naptárat (1-${calendars.length}, vagy q a kilépéshez): `)).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    const selectedIndex = Number.parseInt(answer, 10);

    if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= calendars.length) {
      return calendars[selectedIndex - 1];
    }

    console.log('Érvénytelen választás. Add meg a felsorolt sorszámok egyikét.');
  }
}

/**
 * A `promptForAction` interaktív választ kér a felhasználótól.
 */
async function promptForAction(rl, calendarItem) {
  console.log(`\nKijelölt naptár: ${getCalendarName(calendarItem)}`);
  console.log('Válassz műveletet:');
  console.log('1. Összes esemény törlése');
  console.log('2. Naptár törlése');

  while (true) {
    const answer = (await rl.question('Művelet (1-2, vagy q a kilépéshez): ')).trim();

    if (answer.toLowerCase() === 'q') {
      return null;
    }

    if (answer === '1') {
      return 'delete-events';
    }

    if (answer === '2') {
      return 'delete-calendar';
    }

    console.log('Érvénytelen választás. 1 vagy 2 adható meg.');
  }
}

/**
 * A `confirmAction` megerősítést kér a veszélyes művelet előtt.
 */
async function confirmAction(rl, action, calendarItem, extraLine) {
  const calendarName = getCalendarName(calendarItem);
  const confirmationToken = action === 'delete-events'
    ? 'ESEMÉNYEK TÖRLÉSE'
    : 'NAPTÁR TÖRLÉSE';

  console.log('');
  console.log(`Naptár: ${calendarName}`);
  console.log(`Naptárazonosító: ${calendarItem.id}`);

  if (extraLine) {
    console.log(extraLine);
  }

  console.log(`A megerősítéshez írd be ezt: ${confirmationToken}. Bármi más megszakítja a műveletet.`);
  const answer = (await rl.question('Megerősítés: ')).trim();

  return answer === confirmationToken;
}

/**
 * A `listAllEventIds` összegyűjti a kijelölt naptár törölhető eseményazonosítóit.
 */
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

/**
 * A `deleteEventWithRetry` elvégzi a kapcsolódó törlési műveletet.
 */
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
        console.log(`Már törölve: ${eventId}`);
        return;
      }

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const waitMs = 1000 * (2 ** (attempt - 1));
      console.log(
        `${attempt}/${MAX_RETRIES}. újrapróbálás ${eventId} elemre ${waitMs} ms múlva ` +
        `(status=${status ?? 'ismeretlen'}, reason=${reason ?? 'ismeretlen'})`
      );
      await sleep(waitMs);
    }
  }
}

/**
 * A `assertEventDeleteAccess` ellenőrzi a kötelező előfeltételeket.
 */
function assertEventDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? 'ismeretlen';

  if (!['writer', 'owner'].includes(accessRole)) {
    throw new Error(
      `Az eseménytörléshez writer vagy owner jogosultság szükséges. Jelenlegi accessRole: ${accessRole}`
    );
  }
}

/**
 * A `assertCalendarDeleteAccess` ellenőrzi a kötelező előfeltételeket.
 */
function assertCalendarDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? 'ismeretlen';

  if (calendarItem.primary) {
    throw new Error('Az elsődleges naptár ezzel a szkripttel nem törölhető.');
  }

  if (accessRole !== 'owner') {
    throw new Error(
      `A naptár törléséhez owner jogosultság szükséges. Jelenlegi accessRole: ${accessRole}`
    );
  }
}

/**
 * A `deleteEventIds` elvégzi a kapcsolódó törlési műveletet.
 */
async function deleteEventIds(calendar, calendarId, eventIds) {
  if (eventIds.length === 0) {
    console.log('Nem található aktív esemény. Nincs mit törölni.');
    return;
  }

  for (let index = 0; index < eventIds.length; index += 1) {
    await deleteEventWithRetry(calendar, calendarId, eventIds[index]);

    const current = index + 1;
    if (current % 50 === 0 || current === eventIds.length) {
      console.log(`Törölve: ${current}/${eventIds.length}`);
    }
  }

  console.log(`Kész. ${eventIds.length} esemény törölve.`);
}

/**
 * A `deleteCalendar` elvégzi a kapcsolódó törlési műveletet.
 */
async function deleteCalendar(calendar, calendarItem) {
  assertCalendarDeleteAccess(calendarItem);

  await calendar.calendars.delete({
    calendarId: calendarItem.id,
  });

  console.log(`Kész. Törölt naptár: ${calendarItem.id}`);
}

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const rl = createInterface({input, output});

  try {
    const calendar = await createCalendarClient(rl);

    if (!calendar) {
      console.log('Megszakítva.');
      return;
    }

    const calendars = await listCalendars(calendar);

    if (calendars.length === 0) {
      console.log('A hitelesített fiókhoz nem található naptár.');
      return;
    }

    const selectedCalendar = await promptForCalendar(rl, calendars);

    if (!selectedCalendar) {
      console.log('Megszakítva.');
      return;
    }

    const action = await promptForAction(rl, selectedCalendar);

    if (!action) {
      console.log('Megszakítva.');
      return;
    }

    if (action === 'delete-events') {
      assertEventDeleteAccess(selectedCalendar);

      const eventIds = await listAllEventIds(calendar, selectedCalendar.id);
      const confirmed = await confirmAction(
        rl,
        action,
        selectedCalendar,
        `Törlendő események: ${eventIds.length}`
      );

      if (!confirmed) {
        console.log('Megszakítva. Nem történt eseménytörlés.');
        return;
      }

      await deleteEventIds(calendar, selectedCalendar.id, eventIds);
      return;
    }

    const confirmed = await confirmAction(rl, action, selectedCalendar);

    if (!confirmed) {
      console.log('Megszakítva. A naptár nem lett törölve.');
      return;
    }

    await deleteCalendar(calendar, selectedCalendar);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Hiba:', error?.message || error);

  if (error?.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  }

  process.exitCode = 1;
});
