/**
 * domainek/integraciok/google-naptar/web-szolgaltatas.mjs
 * Webes, nem interaktív Google Naptár adminisztrációs szolgáltatások.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const OAUTH_CONFIG_PATH = path.join(process.cwd(), ".google-calendar-oauth.local.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const PAGE_SIZE = 2500;
const MAX_RETRIES = 5;
const SEND_UPDATES = "none";

function getCalendarName(calendarItem) {
  return calendarItem.summary?.trim() || "(névtelen naptár)";
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
      "rateLimitExceeded",
      "userRateLimitExceeded",
      "quotaExceeded",
      "backendError",
    ].includes(reason);
  }

  return false;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJson(filePath, label) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} nem olvasható: ${error.message}`);
  }
}

async function createCalendarClient(opciok = {}) {
  const reporter = opciok.reporter ?? null;
  const oauthConfig = await readJson(OAUTH_CONFIG_PATH, "A Google OAuth konfiguráció");
  const token = await readJson(TOKEN_PATH, "A Google token gyorsítótár");
  const config = oauthConfig.installed ?? oauthConfig.web;

  if (!config?.client_id || !config?.client_secret) {
    throw new Error("A Google OAuth konfigurációból hiányzik a client_id vagy client_secret.");
  }

  const auth = new google.auth.OAuth2({
    clientId: config.client_id,
    clientSecret: config.client_secret,
    redirectUri: config.redirect_uris?.[0] ?? "http://localhost",
    scopes: SCOPES,
  });

  auth.setCredentials(token);
  await auth.getAccessToken();

  reporter?.info?.("Google Calendar hitelesítés rendben.");

  return google.calendar({
    version: "v3",
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
      fields: "items(id,summary,primary,accessRole),nextPageToken",
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

    return getCalendarName(left).localeCompare(getCalendarName(right), "hu");
  });

  return calendars;
}

function assertEventDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? "ismeretlen";

  if (!["writer", "owner"].includes(accessRole)) {
    throw new Error(
      `Az eseménytörléshez writer vagy owner jogosultság szükséges. Jelenlegi accessRole: ${accessRole}`
    );
  }
}

function assertCalendarDeleteAccess(calendarItem) {
  const accessRole = calendarItem.accessRole ?? "ismeretlen";

  if (calendarItem.primary) {
    throw new Error("Az elsődleges naptár ezzel a felülettel nem törölhető.");
  }

  if (accessRole !== "owner") {
    throw new Error(
      `A naptár törléséhez owner jogosultság szükséges. Jelenlegi accessRole: ${accessRole}`
    );
  }
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
      fields: "items(id,status),nextPageToken",
    });

    for (const item of response.data.items ?? []) {
      if (!item?.id || item.status === "cancelled") {
        continue;
      }

      eventIds.push(item.id);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return eventIds;
}

async function deleteEventWithRetry(calendar, calendarId, eventId, reporter) {
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
        reporter?.warn?.(`Már törölve: ${eventId}`);
        return;
      }

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      const waitMs = 1000 * (2 ** (attempt - 1));
      reporter?.warn?.(
        `${attempt}/${MAX_RETRIES}. újrapróbálás ${eventId} elemre ${waitMs} ms múlva ` +
          `(status=${status ?? "ismeretlen"}, reason=${reason ?? "ismeretlen"})`
      );
      await sleep(waitMs);
    }
  }
}

async function deleteEventIds(calendar, calendarId, eventIds, reporter) {
  if (eventIds.length === 0) {
    reporter?.info?.("Nem található aktív esemény. Nincs mit törölni.");
    return;
  }

  for (let index = 0; index < eventIds.length; index += 1) {
    await deleteEventWithRetry(calendar, calendarId, eventIds[index], reporter);
    const current = index + 1;

    if (current % 50 === 0 || current === eventIds.length) {
      reporter?.info?.(`Törölve: ${current}/${eventIds.length}`);
    }
  }

  reporter?.info?.(`Kész. ${eventIds.length} esemény törölve.`);
}

async function deleteCalendar(calendar, calendarItem, reporter) {
  assertCalendarDeleteAccess(calendarItem);

  await calendar.calendars.delete({
    calendarId: calendarItem.id,
  });

  reporter?.info?.(`Kész. Törölt naptár: ${calendarItem.id}`);
}

export async function listazGoogleNaptarakat(opciok = {}) {
  const calendar = await createCalendarClient(opciok);
  const calendars = await listCalendars(calendar);

  return calendars.map((item) => ({
    id: item.id,
    summary: getCalendarName(item),
    primary: Boolean(item.primary),
    accessRole: item.accessRole ?? "ismeretlen",
  }));
}

export async function vegrehajtGoogleNaptarTorloMuveletet(opciok = {}) {
  const reporter = opciok.reporter ?? null;
  const action = opciok.action;
  const calendarId = String(opciok.calendarId ?? "").trim();
  const confirmed = opciok.confirmed === true;

  if (!calendarId) {
    throw new Error("A Google Naptár művelethez kötelező a calendarId.");
  }

  if (!["delete-events", "delete-calendar"].includes(action)) {
    throw new Error("A Google Naptár művelet csak delete-events vagy delete-calendar lehet.");
  }

  if (!confirmed) {
    throw new Error("A veszélyes Google Naptár művelethez explicit megerősítés szükséges.");
  }

  const calendar = await createCalendarClient({ reporter });
  const calendars = await listCalendars(calendar);
  const calendarItem = calendars.find((item) => item.id === calendarId) ?? null;

  if (!calendarItem) {
    throw new Error(`Nem található ilyen naptár: ${calendarId}`);
  }

  if (action === "delete-events") {
    assertEventDeleteAccess(calendarItem);
    const eventIds = await listAllEventIds(calendar, calendarId);
    await deleteEventIds(calendar, calendarId, eventIds, reporter);

    return {
      action,
      calendarId,
      calendarName: getCalendarName(calendarItem),
      deletedEventCount: eventIds.length,
    };
  }

  await deleteCalendar(calendar, calendarItem, reporter);

  return {
    action,
    calendarId,
    calendarName: getCalendarName(calendarItem),
  };
}
