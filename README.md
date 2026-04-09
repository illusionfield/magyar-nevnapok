# magyar-nevnapok

Modern, MJS-alapú magyar névnap pipeline, amely egységes CLI-n keresztül kezeli

- a legacy primerjegyzék építését,
- a Wikipédia primergyűjtést,
- a végső primer-feloldást,
- a teljes névadatbázis építését,
- a formalizált él-lista generálását,
- az ICS kimenetet,
- valamint az auditokat és riportokat.

A projekt kanonikus felülete a `nevnapok` CLI. A strukturált artifactok alapértelmezett formátuma YAML.

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
  npm run cli -- pipeline futtat teljes
```

ICS generálás a kanonikus adatbázisból:

```bash
  npm run cli -- kimenet general ics
```

Összes audit futtatása:

```bash
  npm run cli -- audit futtat mind
```

Interaktív TUI:

```bash
  npm run tui
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
  output/       generált kanonikus artifactok
```

## Kanonikus artifactok

- `output/primer/legacy-primer.yaml`
- `output/primer/wiki-primer.yaml`
- `output/primer/vegso-primer.yaml`
- `output/adatbazis/nevnapok.yaml`
- `output/adatbazis/formalizalt-elek.yaml`
- `output/naptar/nevnapok.ics`
- `output/riportok/*.yaml`
- `output/pipeline/manifest.yaml`

## Fontos alapelvek

- A YAML az elsődleges fájlformátum.
- JSON export kérhető külön paranccsal.
- A CLI és a TUI ugyanazt az alkalmazásszintű szolgáltatásréteget használja.
- A pipeline lépései deklarált bemenetekkel és kimenetekkel működnek.
- A hivatalos névjegyzék eltérései dokumentált kivétellistában vannak kezelve.

## Dokumentáció

- [Áttekintés](docs/attekintes.md)
- [Architektúra és domainhatárok](docs/architektura.md)
- [Pipeline és manifest](docs/pipeline.md)
- [Artifactum-specifikációk](docs/artifactumok.md)
- [CLI referencia](docs/cli.md)
- [TUI használat](docs/tui.md)
- [Források és dokumentált kivételek](docs/forrasok-es-kivetelek.md)
- [Migráció a régi scriptvilágból](docs/migracio.md)

## Megjegyzés a hivatalos névjegyzék-ellenőrzésről

A kivétellista a

- **2025. július 31-i** anyakönyvezhető névjegyzék,
- és a **2025-08-12-i** ELTE/HUN-REN adatbázisállapot

közti eltéréseket dokumentálja. A lista a `data/hivatalos-nevjegyzek-kivetelek.yaml` fájlban található.
