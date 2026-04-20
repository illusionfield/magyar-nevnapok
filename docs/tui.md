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
- primer audit.

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

## Primer audit

Az egységes `Primer audit` nézet egyetlen workspace-ben adja össze

- a végső primer forrásnézetet,
- a közös hiányzó neveket,
- és a személyes primer kezelést.

A nézet bal oldalán a napi lista látható rövid auditstátusszal.
A jobb oldalon négy fül váltogatható:

- `Összkép`
- `Források`
- `Hiányzók`
- `Személyes`

A `Személyes` fülön:

- a napi helyi kijelölések `Space` billentyűvel kapcsolhatók,
- a mentés a nem követett `.local/nevnapok.local.yaml` `personalPrimary` blokkjába történik,
- `p` billentyűvel a névlista és a személyes beállítások panelje között lehet váltani,
- külön állítható a személyes primerforrás,
- külön kapcsolható a `Normalizált` és a `Rangsor` módosító,
- `g` billentyűvel az aktív, mentett ICS-profil szerinti kimenet azonnal újragenerálható,
- `r` billentyűvel a teljes primer audit frissíthető.

## Billentyűk

- `↑` / `↓` — választás vagy beállításváltás
- `←` / `→` — néven belüli vagy beállításon belüli lépkedés
- `Enter` — indítás
- `Space` — helyi primerkiegészítés vagy személyes beállítás kapcsolása
- `g` — az aktív, mentett ICS-profil szerinti generálás
- `r` — riportfrissítés
- `Tab` vagy `1`–`4` — fülváltás a primer audit nézetben
- `p` — panelváltás a `Személyes` fülön
- `Esc` vagy `v` — vissza a menübe
- `q` — kilépés
