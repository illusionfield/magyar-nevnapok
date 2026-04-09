# Migráció a régi scriptvilágból

## Mi változott?

A korábbi, egymástól független root scriptfájlak helyét átvette:

- az egységes `nevnapok` CLI,
- a deklarált pipeline,
- a kanonikus YAML artifactkészlet,
- az új domain-szerkezet.

## Régi → új gondolkodás

Régen:

- külön script futott külön feladatra,
- JSON köztes fájlok keletkeztek,
- a futási sorrend nehezen volt követhető.

Most:

- a pipeline mondja meg a sorrendet,
- a manifest mutatja az állapotot,
- az artifactok helye és szerepe kanonikus,
- a CLI és a TUI ugyanazt a szolgáltatásréteget használja.

## Ajánlott új munkafolyamat

```bash
  npm run cli -- pipeline allapot
  npm run cli -- pipeline futtat teljes
  npm run cli -- audit futtat mind
```
