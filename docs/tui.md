# TUI használat

A TUI a CLI fölé épített interaktív réteg.

Indítás:

```bash
  npm run tui
```

## Jelenlegi nézetek

- pipeline áttekintő,
- teljes pipeline futtatása,
- ICS generálás,
- ICS-beállítás szerkesztő,
- összes audit futtatása,
- végső primer audit inspector,
- primer nélkül maradó nevek audit inspector,
- saját primer szerkesztő.

## ICS-beállítás szerkesztő

Az `ICS generálás` menüpont most már nem azonnal fut, hanem egy külön nézetet nyit meg.
Itt a mentett helyi YAML `ics` blokkja állítható kurzorból:

- hatókör,
- elrendezés,
- további nevek kezelése,
- split esetén a további naptár elrendezése,
- szökőéves profil,
- évintervallum,
- leírásmód és formátum,
- év-napja megjelenítés,
- további névnapok beemelése a leírásba.
- az aktív ICS kimenet módot.

Minden kapcsolóhoz külön, részletes magyarázat jelenik meg a jobb oldali panelen.
A kijelölés mozgatásakor és az érték váltásakor a felső infósor is azonnal leírja,
hogy az aktuális állás mit jelent a gyakorlatban.
A módosítások azonnal a nem követett `.local/nevnapok.local.yaml` fájlba mentődnek.
A jobb oldali panel már nem parancselőnézetet, hanem a mentett profil összegzését és a YAML-részletet mutatja.
A generálás csak az aktív kimenet módhoz tartozó ICS-fájlokat hagyja meg.

## Audit inspector nézetek

Két böngészhető inspector nézet érhető el:

- `audit-vegso-primer-inspector`
- `audit-primer-nelkul-inspector`

Mindkettő napi bontásban mutatja a riportot, külön bal oldali listával és jobb oldali
részletes panellel. A riport `r` billentyűvel helyben frissíthető.

## Saját primer szerkesztő

Az új szerkesztő a `primer-nelkul-marado-nevek` audit közös oszlopára épül.

- a bal oldali listában a napok között lehet mozogni,
- a jobb oldalon a közös hiányzó névjelöltek jelennek meg,
- `Space` billentyűvel egy név helyi primerkiegészítésként ki-be kapcsolható,
- a mentés a nem követett `.local/nevnapok.local.yaml` `personalPrimary` blokkjába történik,
- `g` billentyűvel az aktív, mentett ICS-profil szerinti kimenet azonnal újragenerálható,
- külön panelben állítható a személyes primerforrás,
- ugyanitt külön kapcsolható a `Normalizált` és a `Rangsor` módosító is.

## Billentyűk

- `↑` / `↓` — választás vagy beállításváltás
- `←` / `→` — néven belüli vagy beállításon belüli lépkedés
- `Enter` — indítás
- `Space` — helyi primerkiegészítés kapcsolása a szerkesztőben
- `g` — az aktív, mentett ICS-profil szerinti generálás a szerkesztőben
- `r` — riport és helyi kijelölések frissítése a szerkesztőben
- `Tab` vagy `p` — panelváltás a saját primer szerkesztőben
- `Esc` vagy `v` — vissza a menübe
- `q` — kilépés
