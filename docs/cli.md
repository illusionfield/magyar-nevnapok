# CLI referencia

## Súgó

```bash
  npm run cli -- --help
```

## Minőségellenőrzés

```bash
  npm run lint
  npm run typecheck
  npm run audit
  npm run ellenorzes
  npm run build
```

Megjegyzés: az `npm run audit` hálózati ellenőrzés, ezért külön marad a gyors helyi
lint- / typecheck- / tesztkörtől.

Az `npm run build` a teljes, elsődleges pipeline-t futtatja végig, tehát ez a projekt
valódi adatépítési buildparancsa.

## Pipeline

```bash
  npm run build
  npm run cli -- pipeline allapot
  npm run cli -- pipeline futtat teljes
  npm run cli -- pipeline futtat legacy-primer-epites
```

## Kimenetek

```bash
  npm run cli -- kimenet general ics
  npm run cli -- kimenet general ics --help
  npm run cli -- kimenet general csv
  npm run cli -- kimenet general excel
  npm run cli -- kimenet general json
  npm run cli -- kimenet general yaml
```

A `csv` export egy UTF-8 BOM-os, pontosvesszős táblázatot készít, hogy magyar
lokáléjú Excelben is helyesen nyíljon meg.

Az `excel` export egy `.xlsx` munkafüzetet készít a következő lapokkal:

- `Nevnapok` — lapos név + nap hozzárendelések,
- `Napok` — napi összegző nézet,
- `Meta` — rövid exportmeta és darabszámok.

Az `ics` generálás két egyszerű kimeneti modellel dolgozik:

- `single` → egyetlen `output/naptar/nevnapok.ics`, benne minden névnap
- `split` → külön `output/naptar/nevnapok-primary.ics` és `output/naptar/nevnapok-rest.ics`

Az ICS-generálás a nem követett `.local/nevnapok.local.yaml` mentett profiljából dolgozik.
Ebben a fájlban él:

- az `ics` blokk a teljes közös naptárprofillal,
- az `ics.partitionMode` az egyfájlos vagy bontott kimenet kijelölésével,
- a `personalPrimary` blokk a helyi primerforrással,
- a `Normalizált` / `Rangsor` módosítók állapota,
- és a kézi helyi primernapok listája.

A közös, követett primerfelülírások mértékadó fájlja továbbra is a
`data/primary-registry-overrides.yaml`.
A helyi overlay kizárólag a `.local/nevnapok.local.yaml`.

A `Normalizált` / `Rangsor` módosítók véglegesítése a `Primer audit` felületén történik.
Az ICS-generálás ezeket már nem számolja újra, hanem a véglegesített
`output/riportok/primer-audit.yaml` snapshotot használja.

Ha a helyi YAML-t kézzel szerkeszted, és ezzel a módosítókat vagy a kézi helyi napokat
megváltoztatod, utána futtasd újra:

```bash
  npm run cli -- audit primer
```

A `nevnapok kimenet general ics` publikus felületén a részletes ICS-kapcsolók megszűntek.
Ha valaki ilyet használ, a CLI célzott hibával jelzi, hogy az ICS-profilt mostantól a
`.local/nevnapok.local.yaml` kezeli.

## Auditok

```bash
  npm run cli -- audit futtat mind
  npm run cli -- audit futtat hivatalos-nevjegyzek
  npm run cli -- audit futtat primer-audit
  npm run cli -- audit primer
  npm run cli -- audit primer reszletek --nap 04-18 --resz forrasok
  npm run cli -- audit primer helyi hozzaad 04-18 Andrea
  npm run cli -- audit primer helyi torol 04-18 Andrea
  npm run cli -- audit primer helyi forras legacy
  npm run cli -- audit primer helyi modosito normalized be
```

## TUI közvetlen nézetindítás

```bash
  npm run cli -- tui --nezet primer-audit
  npm run cli -- tui --nezet ics
```

## Integráció

```bash
  npm run cli -- integracio google-naptar torol -- --calendar-id <azonosito>
```
