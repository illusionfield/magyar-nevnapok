# Webes felület és websocket szerződés

## Munkaterek

A webes felület top-level route-struktúrája:

- `/` — Dashboard
- `/pipeline` — Pipeline
- `/auditok` — Auditok
- `/primer-audit` — Primer audit
- `/ics` — ICS munkatér

A shell slim felső sávból és bal oldali navigációból áll. A felületen globális `kompakt` / `részletes` nézetmód váltható, amely böngészőoldalon perzisztál.

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
- `workspace`
- `status`
- `startedAt`
- `finishedAt`
- `logCount`
- `stageLabel`
- `progress`
- `sections`
- `result`
- `error`

Szabályok:

- egyszerre pontosan **egy** mutáló job lehet aktív,
- második mutáló kérés aktív job mellett **409** hibát kap,
- csak az aktív job és az utolsó lezárt job marad memóriában,
- a webszerver csak **korlátozott hosszúságú log tailt** tart meg,
- a kliens az elsődleges futási állapotot a strukturált `workspace / stageLabel / progress / sections` mezőkből építi,
- a `job:log` esemény technikai, másodlagos kiegészítés marad.

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
- `ics:get-raw-preview`
- `ics:generate`

A fontosabb summary DTO-k szemantikája:

- `dashboard:get` már nem általános kártyahalmazt ad, hanem primer- és auditközpontú szekciókat,
- `pipeline:get` három csoportot ad, és a crawleres lépések safety metaadatait is tartalmazza,
- `ics:preview` havi, sor-alapú előnézetet ad stabil `main` / `rest` naptárszerepekkel és külön névszintű detail payloadokkal.

A `pipeline:run` kérés opcionálisan `confirmCrawlerRun: true` mezőt is fogad. Ez akkor kell, ha a futás web crawleres lépést indítana, és a szerver először `pipeline_confirmation_required` hibával megerősítést kér.

## GUI-elv

A felület nem általános fájlböngésző:

- a Dashboard nem futtató-gyűjtőhely, hanem operatív összkép és navigációs belépőpont,
- a Pipeline oldal csoportos admin nézetet ad közérthetőbb státuszokkal,
- az Auditok oldal auditkatalógust és fluid részletes inspectort ad,
- az Auditok és a Primer audit nagy nézetei **havi lazy részletlekéréssel** töltődnek,
- a Primer audit oldal havi csoportos, táblázatos inline editor,
- az ICS oldal live mentésű beállítófelületet, havi accordionos táblázatos előnézetet, névszintű részletpanelt és lazy nyers ICS-résznézetet ad,
- a nyers terminálkimenet helyett a GUI strukturált HTML-táblákat, névrácsokat és összefoglaló blokkokat használ.

A tényleges irányadó állapot továbbra is a fájlrendszerben él, de a GUI ezt szemantikus szerkesztőkön keresztül kezeli.
