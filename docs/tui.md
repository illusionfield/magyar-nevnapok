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
- primer nélkül maradó nevek külön auditja,
- saját primer szerkesztő.

## ICS-beállítás szerkesztő

Az `ICS generálás` menüpont most már nem azonnal fut, hanem egy külön nézetet nyit meg.
Itt a korábbi CLI-kapcsolók fontosabb része kurzorból állítható:

- split primary/rest,
- primerforrás,
- elsődleges és további naptár módja,
- szökőéves mód és stratégia,
- évintervallum,
- leírásmód és formátum,
- év-napja megjelenítés,
- további névnapok beemelése a leírásba.

## Saját primer szerkesztő

Az új szerkesztő a `primer-nelkul-marado-nevek` audit közös oszlopára épül.

- a bal oldali listában a napok között lehet mozogni,
- a jobb oldalon a közös hiányzó névjelöltek jelennek meg,
- `Space` billentyűvel egy név helyi primerkiegészítésként ki-be kapcsolható,
- a mentés a nem követett `data/primary-registry-overrides.local.yaml` fájlba történik,
- `g` billentyűvel a saját primeres ICS-fájl azonnal újragenerálható.

## Billentyűk

- `↑` / `↓` — választás
- `←` / `→` — néven belüli lépkedés a szerkesztőben
- `Enter` — indítás
- `Space` — helyi primerkiegészítés kapcsolása a szerkesztőben
- `g` — saját naptár újragenerálása a szerkesztőben
- `r` — riport és helyi kijelölések frissítése a szerkesztőben
- `Esc` vagy `v` — vissza a menübe
- `q` — kilépés
