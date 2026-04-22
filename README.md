# magyar-nevnapok

Audit-first, web-only magyar névnap munkakörnyezet.

A projekt elsődleges célja a **teljes auditálhatóság** és egy **kiterjesztett, jól karbantartható primer adatbázis** előállítása. Sok felhasználónak már a primer névjegyzék önmagában is végtermék, ezért kritikus, hogy ott valóban jó nevek szerepeljenek, és minden fontos döntés mögött visszakereshető auditlánc álljon.

A jelenlegi alkalmazás egy **böngészős GUI-ra épülő, single-user Node monolit**:

- a támogatott felület a webes kezelőfelület,
- a **CLI/TUI megszűnt**, nincs párhuzamos vagy átmeneti működés,
- az igazság forrása továbbra is a fájlrendszer:
  - `.local/nevnapok.local.yaml`
  - `data/*`
  - `output/*`
- a hosszú műveletek **egyetlen aktív job** modellen futnak,
- a frontend és a backend alkalmazásszintű kommunikációja **websocketen** megy,
- a GUI nem öncélú admin shell, hanem **szakértői audit- és primer munkatér**.

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

Webszerver indítása a buildelt appal:

```bash
  npm start
```

Teljes adat/pipeline build belső vagy CI célra (ICS generálás nélkül):

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

- `/` — **Dashboard**: audit-first irányítópult, ahol azonnal látszik, hol hibás vagy vitatott a primer, mely auditok blokkolnak, és mely napok igényelnek kézi döntést
- `/auditok` — **Auditok**: elsőrangú auditkatalógus, strukturált összefoglalók, havi bontások és a szerkeszthető auditforrások inline editorai
- `/primer-audit` — **Primer audit**: primer editor snapshot a közös és helyi döntésekhez, forrásbizonyíték-linkekkel visszakötve a külön auditokhoz
- `/pipeline` — **Pipeline**: csoportos, adminisztratív állapotnézet közérthető státuszokkal és célzott futtatással
- `/ics` — **ICS generálás**: live mentésű beállítófelület, havi accordionos táblázatos előnézet, névszintű részletek és letöltés

Az app shell slim felső sávból és bal oldali navigációból áll, benne globális `kompakt` / `részletes` nézetkapcsolóval.

## Audit-first működési modell

A projekt irányadó döntési lánca:

1. primerforrások begyűjtése,
2. végső primerjegyzék feloldása,
3. normalizáló alap előállítása,
4. **külön auditok** futtatása,
5. `primer-audit` editor snapshot képzése,
6. adatbázis- és exportkimenetek lezárása.

Fontos különbség:

- a `vegso-primer` és a `primer-nelkul-marado-nevek` audit **nem háttéranyag**, hanem önálló, elsőrangú audit,
- a `primer-audit` **nem az auditigazság egyetlen hordozója**, hanem szerkesztői/szintetizáló nézet,
- az ICS-generálás **nem a pipeline része**, hanem külön munkatér és külön művelet.

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

Az elsődleges futási visszajelzés már nem a nyers terminállog, hanem a strukturált jobállapot:

- `workspace`
- `stageLabel`
- `progress`
- `sections`

A `job:log` megmarad másodlagos, technikai kiegészítésnek, capped tail + inkrementális események formájában.

## Scriptkészlet

- `npm run dev` — fejlesztői webes felület indítás Vite middlewares módban
- `npm start` — a buildelt web app kiszolgálása Expressből
- `npm run build` — webes felület build
- `npm run data:build` — teljes adat/pipeline build, ICS generálás nélkül
- `npm run lint` — lint
- `npm run typecheck` — statikus szintaxis- és entrypoint-ellenőrzés
- `npm test` — automatizált tesztek, benne audit golden baseline-okkal
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
- `output/primer/*.yaml`
- `output/riportok/*.yaml`
- `output/adatbazis/nevnapok.yaml`
- `output/naptar/*.ics`
- `output/pipeline/manifest.yaml`

## Fontos alapelvek

- A projekt **web-only**.
- A projekt elsődleges célja a **teljes auditálhatóság** és a **jó minőségű primer adatbázis**.
- Egyszerre pontosan **egy mutáló job** lehet aktív.
- Aktív job mellett újabb mutáló websocket kérés **409** hibát kap.
- A pipeline és az auditok továbbra is fájlalapú kimeneteket írnak.
- A `vegso-primer` és a `primer-nelkul-marado-nevek` audit blokkoló auditként is kiemelt helyet kap.
- A `primer-audit` primer editor snapshot, amely a külön auditok bizonyítékait leképezi, nem helyettesíti.
- Az ICS-fájlok generálása nem pipeline-feladat, hanem az `/ics` munkatérről indított külön művelet.

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
