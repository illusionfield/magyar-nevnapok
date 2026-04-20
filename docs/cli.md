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

Az `ics` generálás egyszerre pontosan egy aktív kimenet móddal dolgozik:

- `common` → csak `output/naptar/nevnapok.ics`
- `split` → csak `output/naptar/nevnapok-primary.ics` és `output/naptar/nevnapok-rest.ics`
- `personal` → csak `output/naptar/nevnapok-sajat.ics`

Az ICS-generálás a nem követett `.local/nevnapok.local.yaml` mentett profiljából dolgozik.
Ebben a fájlban él:

- az `ics` blokk a teljes közös naptárprofillal,
- az `ics.outputMode` az aktív ICS-kimenet kijelölésével,
- a `personalPrimary` blokk a személyes primerforrással,
- a `Normalizált` / `Rangsor` módosítók állapota,
- és a kézi helyi primernapok listája.

A személyes primerprofil csak akkor hat a generálásra, ha az aktív mód `personal`.

A `nevnapok kimenet general ics` publikus felületén a részletes ICS-kapcsolók megszűntek.
Ha valaki ilyet használ, a CLI célzott hibával jelzi, hogy az ICS-profilt mostantól a
`.local/nevnapok.local.yaml` kezeli.

A régi `.local/primary-registry-overrides.local.yaml` és
`data/primary-registry-overrides.local.yaml` fájlok csak beolvasási kompatibilitásként maradnak.

## Auditok

```bash
  npm run cli -- audit futtat mind
  npm run cli -- audit futtat hivatalos-nevjegyzek
  npm run cli -- audit futtat vegso-primer
  npm run cli -- audit futtat primer-nelkul-marado-nevek
```

## TUI közvetlen nézetindítás

```bash
  npm run cli -- tui --nezet primer-szerkeszto
  npm run cli -- tui --nezet audit-vegso-primer-inspector
  npm run cli -- tui --nezet audit-primer-nelkul-inspector
```

## Integráció

```bash
  npm run cli -- integracio google-naptar torol -- --calendar-id <azonosito>
```
