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
Itt a korábbi CLI-kapcsolók fontosabb része kurzorból állítható:

- split primary/rest,
- elsődleges és további naptár módja,
- szökőéves mód és stratégia,
- évintervallum,
- leírásmód és formátum,
- év-napja megjelenítés,
- további névnapok beemelése a leírásba.

Minden kapcsolóhoz külön, részletes magyarázat jelenik meg a jobb oldali panelen.
A kijelölés mozgatásakor és az érték váltásakor a felső infósor is azonnal leírja,
hogy az aktuális állás mit jelent a gyakorlatban.
A primerforrás-választó kikerült ebből a nézetből, mert a személyes primerlogika a
saját primer szerkesztőhöz tartozik.

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
- a mentés a nem követett `data/primary-registry-overrides.local.yaml` fájlba történik,
- `g` billentyűvel a saját primeres ICS-fájl azonnal újragenerálható,
- külön panelben állítható a személyes primerforrás is (`default`, `legacy`, `ranked`, `either`).

## Billentyűk

- `↑` / `↓` — választás
- `←` / `→` — néven belüli vagy részleten belüli lépkedés
- `Enter` — indítás
- `Space` — helyi primerkiegészítés kapcsolása a szerkesztőben
- `g` — saját naptár újragenerálása a szerkesztőben
- `r` — riport és helyi kijelölések frissítése a szerkesztőben
- `Tab` vagy `p` — panelváltás a saját primer szerkesztőben
- `Esc` vagy `v` — vissza a menübe
- `q` — kilépés
