# Változásnapló

Ez a fájl a projekt jelentősebb, felhasználói szempontból is látható változásait követi.

## [Unreleased]

Jelenleg nincs külön, kiadásra előkészített új változás.

## [0.6.5] - 2026-04-21

### ICS-kimeneti modell egyszerűsítése

- Az ICS-profil publikus modellje a korábbi `common / split / personal` felosztás helyett `single / split` működésre egyszerűsödött.
- `single` módban egyetlen, minden nevet tartalmazó ICS készül, `split` módban pedig külön elsődleges és külön további naptár jön létre.
- A helyi `.local/nevnapok.local.yaml` automatikusan migrálható az új sémára, és a writer most már csak az új, egyszerűsített struktúrát írja vissza.

### Primer audit mint véglegesítő réteg

- A `Normalizált` és `Rangsor` módosítók véglegesítése teljesen a Primer auditba került.
- A bontott ICS már a Primer audit véglegesített snapshotját használja, és nem számolja újra a primerlogikát.
- A helyi primerforrás, a kézi helyi napok és a módosítók együtt adják a bontott kimenet elsődleges névlistáját.

### TUI, CLI és dokumentációs sweep

- Az ICS és Primer audit felületek user-facing terminológiája egységes lett: a hangsúly mostantól a helyi overlayen, az audit-véglegesítésen és az egyfájlos vagy bontott naptárkimeneten van.
- A README, a CLI/TUI dokumentáció és a kiadási jegyzetek az új `partitionMode`-ra és a Primer audit véglegesítő szerepére épülnek.
- A help- és státuszszövegek már nem a régi külön személyes ICS-módot tekintik mértékadónak.

## [0.6.4] - 2026-04-20

### Primer audit mint véglegesítő réteg

- A közös, követett primerfelülírások mértékadó alapja továbbra is a `data/primary-registry-overrides.yaml`.
- A helyi beállítások egyetlen nem követett forrása a `.local/nevnapok.local.yaml`, de ez most már kifejezetten helyi overlayként működik a közös alap fölött.
- A `Normalizált` és `Rangsor` módosítók véglegesítése átkerült a Primer auditba: az audit most közös alapot, helyi overlayt és eredő helyi primerlistát is előállít.
- Az `output/riportok/primer-audit.yaml` új effektív mezőket is tárol, így külön látszik a közös hiány, a helyben feloldott hiány és a helyben továbbra is nyitott hiány.

### ICS generálás egyszerűsítése

- Az ICS-generálás már nem számolja újra a `Normalizált` / `Rangsor` módosítók hatását.
- A publikus ICS-modell a korábbi `common / split / personal` helyett `single / split` felosztásra egyszerűsödött.
- `single` módban egyetlen, minden nevet tartalmazó ICS készül; `split` módban a Primer audit véglegesített snapshotja alapján külön elsődleges és külön további naptár jön létre.
- A helyi primerforrás és a `Normalizált` / `Rangsor` módosítók a Primer audit részei maradnak, az ICS pedig tisztán konfigurációs és kimeneti felület maradt.
- Kikerült a régi `.local/primary-registry-overrides.local.yaml` és `data/primary-registry-overrides.local.yaml` fallback és kompatibilitási beolvasása.

### Primer audit TUI stabilizáció

- A primer audit napi és névnézete most már az effektív helyi állapotot mutatja: közös alap, helyi overlay és eredő helyi primerek együtt látszanak.
- A primer audit nézet magasságszámítása stabilabb lett: a wrap miatt kilógó sorok helyett tömörített, egysoros megjelenítés kerül előtérbe.
- A `Napok` és `Nevek` mód visszakapta a kártyás queue/szűrő összefoglalót, így a fő kategóriák nem csak az áttekintő nézetben látszanak.
- A hosszú fejléc- és részletsorok most már kis terminálon is kontrolláltan rövidülnek, ezért a nézet jobban illeszkedik kisebb viewportokra is.

## [0.6.3] - 2026-04-20

### ICS és személyes primerworkflow

- Az ICS generálás mértékadó helyi profilja mostantól a nem követett `.local/nevnapok.local.yaml`.
- Az ICS publikus CLI-felületéről kikerültek a részletes kapcsolók; a generálás a mentett helyi YAML-profilt használja.
- Az új helyi YAML egy fájlban tárolja az `ics` blokkot, a helyi primerprofilt és a kézi helyi primernapokat.
- A TUI ICS nézete és a Primer audit helyi beállítási drawerje ugyanazt a közös helyi YAML-fájlt szerkeszti.

### Primer audit TUI

- A Primer audit TUI mostantól három felső szintű módra épül: `Áttekintés`, `Napok` és `Nevek`.
- Elkészült az audit-központú napi queue, a teljes névindex és a napi/név szerinti drill-down navigáció.
- A régi négytabos, kontextusfüggő `p`-s panelváltás helyett egységes keresés, szűrés, rendezés és drawer-modell került be.
- A primer audit riport napi `finalPrimaryNames` és `finalPrimaryCount` mezői mostantól hiánytalan napoknál is helyesek.
- A primer audit nézet most már a terminál magasságához igazodik: az oldalsó listák ablakoltak, a részletek pedig kisebb viewporton tömörebb nézetre váltanak.

## [0.6.2] - 2026-04-09

### Kimenetek

- Elkészült a `nevnapok kimenet general csv` export.
- Elkészült a `nevnapok kimenet general excel` export.
- A CSV-export UTF-8 BOM-mal és pontosvesszős elválasztással készül, hogy magyar Excelben is kényelmesen megnyíljon.
- Az Excel-export több munkalapos `.xlsx` fájlt készít `Nevnapok`, `Napok` és `Meta` lapokkal.

### TUI és auditok

- A TUI `ICS generálás – beállítások` nézete kapcsolónkénti, részletes magyarázó panelt kapott.
- A kijelölt ICS-kapcsoló felső infósora most azonnal leírja, hogy az adott érték milyen gyakorlati kimenetet eredményez.
- A primerforrás-választó kikerült az általános ICS-beállításnézetből, és a személyes `Saját primer szerkesztő` alá került.
- A `nevnapok kimenet general ics --help` már nem emeli ki elsődleges workflowként a régi `--primary-source` kapcsolót; ez kompatibilitási opcióként megmaradt, de a személyes primerforrás ajánlott kezelési helye a TUI szerkesztő.
- Elkészült a `Végső primer audit inspector` és a `Primer nélkül maradó nevek inspector` böngészhető TUI-nézet.
- A végső primer és a primer nélküli audit közös alapmodulba került, így a napi térképezési és időrendi segédlogika már nem párhuzamosan él.
- A terminálos auditnézetek finomabb színezést kaptak: színezett forráscímkék, finomított dátum- és rejtettnév-hangsúlyok.

### Minőségellenőrzés és workflow

- Elkészült a szabványos `npm run build` parancs, amely a teljes elsődleges pipeline-t futtatja.
- Elkészült a `npm run typecheck` parancs, amely a teljes saját JS/MJS kódfelületet és a package entrypointokat ellenőrzi `node --check` alapon.
- Az `npm run ellenorzes` most már a lint és a tesztek mellett a typecheck kört is tartalmazza.
- A dokumentáció minden fontos helyen külön nevezi a build, a typecheck, a lint, a teszt és az audit szerepét.

## [0.6.1] - 2026-04-09

### Új auditok

- Elkészült a `primer-nelkul-marado-nevek` audit.
- Az új audit havi bontásban mutatja a végső primerkészletből teljesen kimaradó, de a normalizált vagy rangsorolt forrásban szereplő neveket.
- A terminálos nézet dátumszínezést kapott a végső primerdarabszám alapján, és külön kiemeli azokat a hiányzó neveket, amelyek az adott napi végső primerhez kapcsolódnak.
- Az új audit külön menüpontként megjelent a TUI-ban is.
- A riport új közös oszlopot kapott, amely a normalizált és a rangsorolt hiányok unióját mutatja.

### Személyes naptár és helyi felülírás

- Elkészült a helyi, nem követett primerkiegészítési fájl: `data/primary-registry-overrides.local.yaml`.
- A TUI új, kurzoros primer szerkesztőt kapott, ahol a közös hiányzó oszlopból `Space` billentyűvel lehet neveket hozzáadni a személyes primerlistához.
- Az `ics` generálás a közös naptár mellett opcionálisan egy saját primeres naptárat is előállít `output/naptar/nevnapok-sajat.ics` néven.
- A `nevnapok kimenet general ics --help` most ismét kilistázza a régi, részletes ICS-kapcsolókat is.
- A TUI `ICS generálás` menüpontja külön beállításnézetet kapott a fontosabb ICS-opciók kurzoros vezérléséhez.

### Karbantarthatóság

- A primerrokonsági auditlogika közös helpermodulba került, hogy a végső primer riport és a külön hiányzóneves audit ugyanazt a kapcsolati feloldást használja.

### Függőségek, biztonság és scrape stabilitás

- A `puppeteer` frissült a `24.x` vonalra, így az `npm audit` ismét zöld.
- A HUN-REN scraper közös Puppeteer-indítási kompatibilitási kapcsolókat kapott, hogy a fej nélküli Chromium ne blokkolja a HTTP-s portált `ERR_BLOCKED_BY_CLIENT` hibával.
- Külön `npm run audit` parancs került a repo scriptjei közé az audit állapot gyors ellenőrzéséhez.

## [0.6.0] - 2026-04-09

### Fő átalakítások

- A projekt elsődleges belépési pontja mostantól az `index.mjs`.
- A futtatható parancssori wrapper külön fájlba került: `bin/nevnapok.mjs`.
- A korábbi szétszórt scriptvilág helyét egységes CLI, TUI és deklarált pipeline vette át.
- A strukturált artifactok elsődleges formátuma YAML lett.

### Új felületek

- Elkészült a magyar nyelvű `nevnapok` CLI:
  - `pipeline allapot`
  - `pipeline futtat <cel>`
  - `kimenet general <formatum>`
  - `audit futtat <ellenorzes>`
  - `integracio google-naptar torol`
  - `tui`
- Elkészült az Ink-alapú interaktív terminálfelület.

### Pipeline és artifactok

- Bevezetésre került az elsődleges pipeline-manifest: `output/pipeline/manifest.yaml`.
- A fő generált kimenetek egységes helyre kerültek:
  - `output/primer/`
  - `output/adatbazis/`
  - `output/naptar/`
  - `output/riportok/`
- A kézi primerfelülírás JSON-ról YAML-ra váltott.

### Auditok és dokumentált eltérések

- A hivatalos névjegyzék-ellenőrzés dokumentált kivétellistával működik.
- A kivétellista a **2025. július 31-i** anyakönyvezhető névjegyzék és a **2025-08-12-i** ELTE/HUN-REN adatbázisállapot ismert eltéréseit rögzíti.

### Minőség és karbantarthatóság

- A kódbázis végigment egy teljes user-facing sweepen.
- A fontos működési pontokra JSDoc-kommentek és célzott magyarázó kommentek kerültek.
- Bevezetésre került a repo-szintű lintelés az `npm run lint` paranccsal.
- Az összetett helyi ellenőrzés parancsa: `npm run ellenorzes`.
