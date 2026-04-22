# magyar-nevnapok

Web-only, helyi használatra szánt magyar névnap alkalmazás.

A projekt **böngészős GUI-ra épülő, single-user Node monolit**:

- a támogatott felület a webes kezelőfelület,
- a **CLI/TUI megszűnt**, nincs párhuzamos vagy átmeneti működés,
- az igazság forrása továbbra is a fájlrendszer:
  - `.local/nevnapok.local.yaml`
  - `data/*`
  - `output/*`
- a hosszú műveletek **egyetlen aktív job** modellen futnak,
- a frontend és a backend alkalmazásszintű kommunikációja **websocketen** megy,
- a GUI nem általános fájlböngésző, hanem **szerkesztő-központú munkatérkészlet**.

A csomag alkalmazásként él tovább: **private repo-app**, nincs támogatott publikus JS API, nincs `bin`, nincs CLI-szerződés.

## Gyors indulás

Telepítés:

```bash
  npm install
```

Fejlesztői webes felület Vite middlewares módban:

```bash
  npm run dev
```

Production web build:

```bash
  npm run build
```

Web szerver indítása a buildelt appal:

```bash
  npm start
```

Teljes adat/pipeline build belső vagy CI célra:

```bash
  npm run data:build
```

Minőségellenőrzés:

```bash
  npm run lint
  npm run typecheck
  npm test
  npm run ellenorzes
```

Alapértelmezett futási cím:

```text
  http://127.0.0.1:3000
```

A `HOST` és `PORT` környezeti változóval felülbírálható.

## Webes munkaterek

- `/` — **Dashboard**: operatív összkép, kapcsolat, jobállapot, KPI-k és gyors műveletek
- `/pipeline` — **Pipeline**: lépésenként kibontott inspector és célzott futtatás
- `/auditok` — **Auditok**: auditkatalógus, részletes inspectorok, a szerkeszthető források inline editorai
- `/primer-audit` — **Primer audit**: havi csoportos, táblázatos inline editor a közös és helyi primerdöntésekhez
- `/ics` — **ICS generálás**: teljes beállítófelület, mentett állapot + draft + előnézet, valamint letöltés

## Kommunikációs modell

A GUI támogatott szerződése:

- egy websocket endpoint: `/ws`
- egy letöltési endpoint-család: `/letoltes/:token`

A websocket üzenetburkoló:

- kliens kérés: `{ id, tipus, payload }`
- szerver válasz: `{ replyTo, ok, data }`
- szerver hiba: `{ replyTo, ok: false, error }`
- szerver push esemény: `{ tipus, data }`

A jobállapot és a live log websocket push eseményként érkezik:

- `job:update`
- `job:log`
- `job:finished`

A jobnapló nem teljes snapshotként kering, hanem capped log tail + inkrementális logesemény modellben.

## Scriptkészlet

- `npm run dev` — fejlesztői webes felület indítás Vite middlewares módban
- `npm start` — a buildelt web app kiszolgálása Expressből
- `npm run build` — webes felület build
- `npm run data:build` — teljes adat/pipeline build
- `npm run lint` — lint
- `npm run typecheck` — statikus szintaxis- és entrypoint-ellenőrzés
- `npm test` — automatizált tesztek
- `npm run ellenorzes` — lint + typecheck + teszt + web build
- `npm run audit` — dependency audit

## Irányadó könyvtárszerkezet

```text
  web/          Express szerver, websocket réteg, React kliens és shared webes modulok
  pipeline/     lépésregiszter, függőségek és manifest-kezelés
  domainek/     üzleti logika domainenként szétválasztva
  kozos/        YAML, fájlrendszer, validáció és közös segédek
  docs/         részletes magyar dokumentáció
  data/         kézi források és kivétellisták
  output/       generált elsődleges kimenetek és riportok
  .local/       nem követett helyi profilok
```

## Irányadó fájlok

- `data/primary-registry-overrides.yaml`
- `data/hivatalos-nevjegyzek-kivetelek.yaml`
- `.local/nevnapok.local.yaml`
- `output/adatbazis/nevnapok.yaml`
- `output/primer/*.yaml`
- `output/riportok/*.yaml`
- `output/naptar/*.ics`
- `output/pipeline/manifest.yaml`

## Fontos alapelvek

- A projekt **web-only**.
- Egyszerre pontosan **egy mutáló job** lehet aktív.
- Aktív job mellett újabb mutáló websocket kérés **409** hibát kap.
- A pipeline, az auditok és a kimenetek továbbra is fájlalapú kimeneteket írnak.
- A Primer audit véglegesíti az elsődleges névlogikát a bontott ICS-kimenethez.
- A `single` és `split` ICS-modell maradt érvényben.
- A GUI elsődlegesen **editorokat** ad: auditforrás-szerkesztőt, primer inline editort és teljes ICS konfigurátort.

## Dokumentáció

- [Áttekintés](docs/attekintes.md)
- [Web GUI és websocket szerződés](docs/web-gui.md)
- [Architektúra és domainhatárok](docs/architektura.md)
- [Pipeline és manifest](docs/pipeline.md)
- [Kimenetek és irányadó fájlok](docs/artifactumok.md)
- [Források és dokumentált kivételek](docs/forrasok-es-kivetelek.md)
- [Migráció a web-only modellre](docs/migracio.md)
- [Változásnapló](CHANGELOG.md)
- [0.7.0 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.7.0.md)

## Megjegyzés a hivatalos névjegyzék-ellenőrzésről

A kivétellista a

- **2025. július 31-i** anyakönyvezhető névjegyzék,
- és a **2025-08-12-i** ELTE/HUN-REN adatbázisállapot

közti eltéréseket dokumentálja. A lista a `data/hivatalos-nevjegyzek-kivetelek.yaml` fájlban található.
