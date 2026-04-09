# CLI referencia

## Súgó

```bash
  npm run cli -- --help
```

## Minőségellenőrzés

```bash
  npm run lint
  npm run audit
  npm run ellenorzes
```

Megjegyzés: az `npm run audit` hálózati ellenőrzés, ezért külön marad a gyors helyi
lint- és tesztkörtől.

## Pipeline

```bash
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

Ha létezik helyi primerkiegészítés a `data/primary-registry-overrides.local.yaml` fájlban,
akkor az `ics` generálás a közös `output/naptar/nevnapok.ics` mellett a
`output/naptar/nevnapok-sajat.ics` fájlt is elkészíti.

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
```

## Integráció

```bash
  npm run cli -- integracio google-naptar torol -- --calendar-id <azonosito>
```
