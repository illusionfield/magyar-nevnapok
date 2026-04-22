# Webes felület és websocket szerződés

## Munkaterek

A webes felület top-level route-struktúrája:

- `/` — Dashboard
- `/pipeline` — Pipeline
- `/auditok` — Auditok
- `/primer-audit` — Primer audit
- `/ics` — ICS generálás

A felület minden user-facing szövege magyar.

## Kommunikációs modell

A támogatott frontend contract:

- websocket: `/ws`
- letöltés: `/letoltes/:token`

A websocket üzenetburkoló egységes:

- kliens kérés: `{ id, tipus, payload }`
- szerver válasz: `{ replyTo, ok, data }`
- szerver hiba: `{ replyTo, ok: false, error }`
- szerver push esemény: `{ tipus, data }`

A jobállapot és a live log külön websocket push eseményként érkezik:

- `job:update`
- `job:log`
- `job:finished`

## Job-modell

A GUI minden hosszabb mutáló műveletet központi jobkezelőn keresztül indít.

Egy job minimális állapota:

- `id`
- `kind`
- `target`
- `status`
- `startedAt`
- `finishedAt`
- `logCount`
- `result`
- `error`

Szabályok:

- egyszerre pontosan **egy** mutáló job lehet aktív,
- második mutáló kérés aktív job mellett **409** hibát kap,
- csak az aktív job és az utolsó lezárt job marad memóriában,
- a webszerver csak **korlátozott hosszúságú log tailt** tart meg,
- a kliens a naplófolyamot **inkrementális logeseményekből** építi újra.

## Szemantikus műveletek

A kliens nem nyers fájlelőnézetet kér, hanem célzott workspace DTO-kat és szerkesztőműveleteket.

A jelenlegi főbb websocket műveletek:

- `dashboard:get`
- `pipeline:get`
- `pipeline:run`
- `audits:get-catalog`
- `audits:get-detail-summary`
- `audits:get-detail-month`
- `audits:run`
- `audits:save-official-exceptions`
- `primer-audit:get-summary`
- `primer-audit:get-month`
- `primer-audit:get-names`
- `primer-audit:save-settings`
- `primer-audit:save-common-day`
- `primer-audit:save-local-day`
- `ics:get-editor`
- `ics:save`
- `ics:preview`
- `ics:generate`

## GUI-elv

A felület nem általános fájlböngésző:

- az Auditok oldal auditkatalógust és részletes inspectorokat ad,
- az Auditok és a Primer audit nagy nézetei **havi lazy részletlekéréssel** töltődnek,
- a Primer audit oldal havi csoportos, táblázatos inline editor,
- az ICS oldal teljes beállítófelületet, draft előnézetet és letöltést ad,
- a Pipeline oldal lépésenként kibontott inspector,
- a Dashboard operatív összkép.

A tényleges irányadó állapot továbbra is a fájlrendszerben él, de a GUI ezt szemantikus szerkesztőkön keresztül kezeli.
