# magyar-nevnapok

Modern, MJS-alapú magyar névnap pipeline, amely egységes CLI-n keresztül kezeli

- a legacy primerjegyzék építését,
- a Wikipédia primergyűjtést,
- a végső primer-feloldást,
- a teljes névadatbázis építését,
- a formalizált él-lista generálását,
- az ICS kimenetet,
- valamint az auditokat és riportokat.

A projekt elsődleges felülete a `nevnapok` CLI. A strukturált artifactok alapértelmezett formátuma YAML.

## Gyors indulás

Telepítés:

```bash
  npm install
```

Súgó:

```bash
  npm run cli -- --help
```

Pipeline állapot:

```bash
  npm run cli -- pipeline allapot
```

Teljes build:

```bash
  npm run build
```

CLI-ekvivalens:

```bash
  npm run cli -- pipeline futtat teljes
```

ICS generálás az elsődleges adatbázisból:

```bash
  npm run cli -- kimenet general ics
```

CSV export az elsődleges adatbázisból:

```bash
  npm run cli -- kimenet general csv
```

Excel export az elsődleges adatbázisból:

```bash
  npm run cli -- kimenet general excel
```

Összes audit futtatása:

```bash
  npm run cli -- audit futtat mind
```

Primer audit összképe:

```bash
  npm run cli -- audit primer
```

Interaktív TUI:

```bash
  npm run tui
```

Közvetlen indítás a primer audit nézettel:

```bash
  npm run cli -- tui --nezet primer-audit
```

Lint:

```bash
  npm run lint
```

Typecheck:

```bash
  npm run typecheck
```

Teljes helyi ellenőrzés:

```bash
  npm run ellenorzes
```

Ez jelenleg a lint + typecheck + teszt gyors helyi köre.

NPM audit:

```bash
  npm run audit
```

## Kanonikus könyvtárszerkezet

```text
  bin/          futtatható CLI indító
  cli/          parancsdefiníciók és súgó
  tui/          interaktív varázsló és áttekintő
  pipeline/     lépésregiszter és manifest-kezelés
  domainek/     üzleti logika domainenként szétválasztva
  kozos/        YAML, fájlrendszer, validáció, terminál segédek
  docs/         részletes magyar dokumentáció
  data/         kézi források és kivétellisták
  output/       generált elsődleges artifactok
```

## Kanonikus artifactok

- `output/primer/legacy-primer.yaml`
- `output/primer/wiki-primer.yaml`
- `output/primer/vegso-primer.yaml`
- `output/adatbazis/nevnapok.yaml`
- `output/adatbazis/nevnapok.csv`
- `output/adatbazis/nevnapok.xlsx`
- `output/adatbazis/formalizalt-elek.yaml`
- `output/naptar/nevnapok.ics` — az alapértelmezett, egyfájlos kimenet
- `output/naptar/nevnapok-primary.ics` — a bontott kimenet alapértelmezett elsődleges naptára
- `output/naptar/nevnapok-rest.ics` — a bontott kimenet alapértelmezett további naptára
- `output/riportok/*.yaml`
- `output/pipeline/manifest.yaml`

Kiemelt riportok:

- `output/riportok/primer-audit.yaml`

Helyi, nem követett bemenet:

- `.local/nevnapok.local.yaml`

## Fontos alapelvek

- A YAML az elsődleges fájlformátum.
- JSON export kérhető külön paranccsal.
- CSV és Excel export közvetlenül kérhető a névadatbázisból.
- A CLI és a TUI ugyanazt az alkalmazásszintű szolgáltatásréteget használja.
- A pipeline lépései deklarált bemenetekkel és kimenetekkel működnek.
- A hivatalos névjegyzék eltérései dokumentált kivétellistában vannak kezelve.
- A közös, követett primerfelülírások mértékadó fájlja a `data/primary-registry-overrides.yaml`.
- Az ICS-profil, a helyi primerprofil és a kézi helyi primernapok egy közös, nem követett helyi YAML-fájlban élnek: `.local/nevnapok.local.yaml`.
- A helyi YAML `personalPrimary` blokkja a helyi primerforrást, a `Normalizált` / `Rangsor` módosítókat és a kézi helyi primernapokat tárolja.
- A közös alap továbbra is a `data/primary-registry-overrides.yaml`, erre ül rá a helyi overlay a `.local/nevnapok.local.yaml` alapján.
- A `Normalizált` / `Rangsor` módosító a Primer auditban véglegesül; az ICS-generálás ezt a véglegesített audit snapshotot használja, nem számolja újra.
- Az `ics.partitionMode` két egyszerű kimeneti modellt kezel: `single` esetén egyetlen, minden nevet tartalmazó ICS készül, `split` esetén külön elsődleges és külön további naptár jön létre.
- A scraper réteg Puppeteer 24-gyel is stabilan fut; a HUN-REN HTTP-forráshoz a projekt központi kompatibilitási launch-opciókat használ.
- Az `ics` generálás publikus CLI-felülete már nem részletes kapcsolókkal dolgozik, hanem a mentett helyi YAML-profilt használja.
- A TUI ICS nézete és a Primer audit helyi beállítási drawerje ugyanazt a helyi YAML-fájlt frissíti.

## Dokumentáció

- [Áttekintés](docs/attekintes.md)
- [Architektúra és domainhatárok](docs/architektura.md)
- [Pipeline és manifest](docs/pipeline.md)
- [Artifactum-specifikációk](docs/artifactumok.md)
- [CLI referencia](docs/cli.md)
- [TUI használat](docs/tui.md)
- [Források és dokumentált kivételek](docs/forrasok-es-kivetelek.md)
- [Migráció a régi scriptvilágból](docs/migracio.md)
- [Változásnapló](CHANGELOG.md)
- [0.6.5 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.5.md)
- [0.6.4 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.4.md)
- [0.6.3 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.3.md)
- [0.6.2 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.2.md)
- [0.6.1 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.1.md)
- [0.6.0 kiadási jegyzetek](docs/kiadasi-jegyzetek/0.6.0.md)

## Megjegyzés a hivatalos névjegyzék-ellenőrzésről

A kivétellista a

- **2025. július 31-i** anyakönyvezhető névjegyzék,
- és a **2025-08-12-i** ELTE/HUN-REN adatbázisállapot

közti eltéréseket dokumentálja. A lista a `data/hivatalos-nevjegyzek-kivetelek.yaml` fájlban található.
