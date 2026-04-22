# Migráció a web-only modellre

## Mi változott?

A projekt hardcut refaktorral teljesen **webes felület** alapú működésre állt át.

Ez azt jelenti, hogy:

- a támogatott kezelőfelület a böngészős GUI,
- a CLI és a TUI megszűnt,
- nincs párhuzamos vagy átmeneti dual-run modell,
- a package alkalmazásként működik tovább,
- a pipeline, az auditok és a kimenetek továbbra is a fájlrendszert írják.

## Régi → új gondolkodás

Korábban:

- külön CLI-parancsok és terminálos nézetek vezérelték a munkát,
- a pipeline futtatása és az auditok tipikusan parancssorból indultak,
- a Primer audit terminálos workspace-ként élt.

Most:

- a dashboard és a külön webes munkaterek adják a kezelőfelületet,
- a pipeline, audit és export műveletek websocket műveleteken keresztül indulnak,
- a Primer audit shared állapotgéppel, böngészős felületen működik,
- minden hosszú művelet központi jobként fut live loggal.

## Új ajánlott workflow

```bash
  npm install
  npm run dev
```

Majd a böngészőben:

```text
  http://127.0.0.1:3000
```

Külön célokra:

```bash
  npm run build
  npm start
  npm run data:build
  npm run ellenorzes
```

## Mi maradt változatlan?

- az igazság forrása továbbra is a `data/*`, az `output/*` és a `.local/nevnapok.local.yaml`,
- a YAML maradt az elsődleges strukturált artifactformátum,
- a Primer audit véglegesítő szerepe megmaradt,
- az ICS továbbra is `single` vagy `split` modellben készül.
