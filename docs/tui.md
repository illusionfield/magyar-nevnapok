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
A TUI kizárólag ezt az egységes helyi YAML-profilt kezeli; a régi külön helyi
override fájlok már nem részei a működésnek.
A jobb oldali panel már nem parancselőnézetet, hanem a mentett profil összegzését és a YAML-részletet mutatja.
A generálás csak az aktív kimenet módhoz tartozó ICS-fájlokat hagyja meg.

## Primer audit

Az új `Primer audit` nézet audit-központú, többnézetes workspace:

- `Áttekintés` — éves KPI-k, havi bontás és gyors queue-kártyák,
- `Napok` — szűrhető napi auditlista és egyetlen részletes napi panel,
- `Nevek` — teljes, kereshető névindex az összes forrásból.

### Áttekintés

Az áttekintő mód azonnal megmutatja:

- az éves összesítő számokat,
- a havi bontást,
- valamint az akciózható queue-kat:
  - hiányzós napok,
  - kézi override napok,
  - helyi kijelölések,
  - eltéréses napok,
  - összes nap.

`Enter` billentyűvel a kijelölt queue napi nézetére lehet ugrani.

### Napok

A `Napok` mód bal oldalán a szűrt napi queue látható.
A jobb oldalon egyetlen részletes panel jelenik meg fix blokkokkal:

- `Végső döntés`,
- `Forrásmátrix`,
- `Nyers és rejtett nevek`,
- `Személyes műveletek`.

A napi kézi helyi kijelölések `Space` billentyűvel kapcsolhatók, ha a fókusz a
személyes névlistán van.
A mentés a nem követett `.local/nevnapok.local.yaml` `personalPrimary`
blokkjába történik.

### Nevek

A `Nevek` mód a teljes névindexet adja:

- az összes elérhető forrásból építkezik,
- kereshető és szűrhető,
- megmutatja az összes előforduló napot és az adott napi státuszt,
- `Enter` billentyűvel a kijelölt előfordulás napi auditnézetére lehet ugrani.

### Személyes primer-beállítások

`b` billentyűvel külön drawer nyitható a személyes primerforrás és a
`Normalizált` / `Rangsor` módosítók állításához.

Ez a drawer ugyanazt a nem követett helyi YAML-profilt írja, mint az ICS
nézet.
A `Normalizált` / `Rangsor` módosítók véglegesítése a Primer audit része;
az ICS-generálás ezeket már a véglegesített audit snapshotból olvassa vissza.

## Billentyűk

- `↑` / `↓` — mozgás az aktív listában
- `←` / `→` — panelváltás a napi vagy névnézetben
- `Enter` — drill-down, kibontás vagy ugrás a kijelölt napra
- `Space` — kézi helyi primerkiegészítés kapcsolása a napi személyes listában
- `g` — az aktív, mentett ICS-profil szerinti generálás
- `r` — riportfrissítés
- `Tab` vagy `1`–`3` — módváltás a primer audit nézetben
- `/` — keresés a `Napok` vagy `Nevek` módban
- `f` — előre definiált szűrők váltása
- `s` — rendezés váltása
- `b` — személyes primer-beállítások drawer
- `?` — helyi súgó
- `Esc` vagy `v` — vissza a menübe
- `q` — kilépés
