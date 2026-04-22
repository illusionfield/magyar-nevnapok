# Webes felület és websocket szerződés

## Munkaterek

A webes felület top-level route-struktúrája:

- `/` — Dashboard
- `/pipeline` — Pipeline
- `/auditok` — Auditok
- `/primer-audit` — Primer audit
- `/ics` — ICS munkatér

A shell slim felső sávból és bal oldali navigációból áll. A felületen globális `kompakt` / `részletes` nézetmód váltható, amely böngészőoldalon perzisztál.

## Audit-first felületi elv

A GUI nem általános fájlböngésző és nem öncélú admin shell.

A fő felhasználói célok:

- gyorsan látszódjon, **hol rossz vagy vitatott a primer**,
- előre kerüljenek a **blokkoló eltérések**,
- a primer editorból vissza lehessen jutni a **forrásbizonyítékot** adó külön auditokhoz,
- az ICS külön munkatér maradjon, ne húzza el a primer- és auditfókuszt.

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

- `dashboard:get` audit-first összképet ad, külön kiemelve a primerblokkoló auditokat,
- `audits:get-catalog` elsőrangúan visszaadja a `vegso-primer` és a `primer-nelkul-marado-nevek` auditot is,
- `audits:get-detail-summary` és `audits:get-detail-month` egységes, strukturált szekciómodellel dolgozik,
- `primer-audit:get-*` payload editor/snapshot szerepet tükröz, nem külön auditként viselkedik,
- `ics:preview` havi, sor-alapú előnézetet ad stabil `main` / `rest` naptárszerepekkel és külön névszintű detail payloadokkal.

A `pipeline:run` kérés opcionálisan `confirmCrawlerRun: true` mezőt is fogad. Ez akkor kell, ha a futás web crawleres lépést indítana, és a szerver először `pipeline_confirmation_required` hibával megerősítést kér.

## GUI-elv workspace-enként

- A **Dashboard** nem futtató-gyűjtőhely, hanem operatív összkép és navigációs belépőpont.
- A **Pipeline** oldal csoportos admin nézetet ad közérthetőbb státuszokkal.
- Az **Auditok** oldal auditkatalógust és fluid részletes inspectort ad, blokkoló auditokkal elöl.
- Az **Auditok** és a **Primer audit** nagy nézetei havi lazy részletlekéréssel töltődnek.
- A **Primer audit** oldal primer editor, ahol a szerkesztői döntések audit-bizonyíték linkeken visszamutatnak a külön auditokra.
- Az **ICS** oldal live mentésű beállítófelületet, havi accordionos táblázatos előnézetet, névszintű részletpanelt és lazy nyers ICS-résznézetet ad.
- A nyers terminálkimenet helyett a GUI strukturált HTML-táblákat, névrácsokat és összefoglaló blokkokat használ.

A tényleges irányadó állapot továbbra is a fájlrendszerben él, de a GUI ezt szemantikus szerkesztőkön keresztül kezeli.
