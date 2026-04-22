# Pipeline és manifest

## Irányadó lépések

1. `legacy-primer-epites`
2. `wiki-primer-gyujtes`
3. `vegso-primer-feloldas`
4. `portal-nevadatbazis-epites`
5. `primer-audit-frissites`
6. `formalizalt-elek-generalasa`
7. `naptar-generalas`
8. `audit-futtatas`

## Futtatás

Teljes adat/pipeline build:

```bash
  npm run data:build
```

A webes felület célzott pipeline-műveletei websocketen mennek:

- állapotlekérés: `pipeline:get`
- futtatás: `pipeline:run`

A futtató payload tipikusan:

```json
  {
    "target": "teljes",
    "force": false
  }
```

## Pipeline állapot

A pipeline állapota a dashboardon és a `/pipeline` munkatéren látható.

Az állapotnézet minden lépéshez mutatja:

- a számított státuszt,
- az utolsó futást,
- a manifest utolsó ismert státuszát,
- a releváns figyelmeztetést,
- az elérhető lépésenkénti akciókat.

## Manifest

Helye:

```text
  output/pipeline/manifest.yaml
```

Egy lépés manifest-bejegyzése tipikusan tartalmazza:

- `stepId`
- `generatedAt`
- `status`
- `inputs`
- `outputs`
- `durationMs`
- `checksum`
- `sizeBytes`
- `error`

## Job-integráció

A web réteg a pipeline futtatást központi jobként indítja.

Ennek következményei:

- egyszerre csak egy mutáló futtatás lehet aktív,
- a logfolyam websocket push eseményként érkezik a GUI-ba,
- aktív futás közben egy újabb mutáló kérés 409 hibát kap,
- a pipeline read-only állapotlekérdezése ettől még elérhető marad.
