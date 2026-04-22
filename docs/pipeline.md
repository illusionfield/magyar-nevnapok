# Pipeline és manifest

## Irányadó lépések

A pipeline most konkrét, végrehajtható lépésekre bontva követi a projekt fő folyamatait:

1. `legacy-primer-epites`
2. `wiki-primer-gyujtes`
3. `vegso-primer-feloldas`
4. `portal-nevadatbazis-epites`
5. `formalizalt-elek-generalasa`
6. `audit-wiki-vs-legacy`
7. `audit-primer-normalizalo-alap`
8. `audit-primer-normalizalo`
9. `audit-vegso-primer`
10. `audit-primer-nelkul-marado-nevek`
11. `audit-primer-audit`
12. `audit-hivatalos-nevjegyzek`
13. `audit-legacy-primer`

Az ICS-generálás **nem a pipeline része**. Az ICS a külön `/ics` munkatéren kérhető előnézettel és letöltéssel.

Ezek fölött a GUI és a websocket API három admin csoportot használ:

- `forrasok-es-alapadatok`
- `primer-audit`
- `auditok`

## Futtatás

Teljes adat/pipeline build:

```bash
  npm run data:build
```

Ez a kör a forrásokat, a primerláncot, az auditokat és a kísérő kimeneteket frissíti, de **nem generál ICS-fájlokat**.

A webes felület célzott pipeline-műveletei websocketen mennek:

- állapotlekérés: `pipeline:get`
- futtatás: `pipeline:run`

A futtató payload tipikusan:

```json
  {
    "target": "teljes",
    "force": false,
    "confirmCrawlerRun": false
  }
```

## Safe crawler policy

Két lépés web crawleres védelmet kapott:

- `wiki-primer-gyujtes`
- `portal-nevadatbazis-epites`

Normál frissítésnél ezek nem egyszerű frissességi lánc alapján dőlnek el, hanem minimál sanity szerint:

- ha a meglévő kimenet rendben van, a lépés **kihagyható**,
- ha a kimenet hiányzik,
- vagy sanity anomália látszik,
  akkor a lépés futásra jelölt lesz.

Ha egy ilyen lépés tényleg futna, a szerver `pipeline_confirmation_required` hibát ad, és a GUI külön megerősítést kér. A kliens jóváhagyás után ugyanazt a kérést újraküldi `confirmCrawlerRun: true` mezővel.

## Pipeline állapot

A pipeline állapota a dashboardon és a `/pipeline` munkatéren látható.

Az állapotnézet minden lépéshez mutatja:

- a számított státuszt,
- az utolsó futást,
- a manifest utolsó ismert státuszát,
- a releváns figyelmeztetést vagy magyarázatot,
- a crawleres lépések safety metaadatait,
- az elérhető csoport- és lépésszintű akciókat.

A számított státuszok admin nézetben jelennek meg, nem fejlesztői zsargonnal:

- **friss** — a lépés jelen állapot szerint rendben van,
- **hiányzik** — nincs használható kimenet,
- **frissítés kell** — a kimenet elavult vagy sanity alapján hibás,
- **előző lépésre vár** — előbb másik lépést kell frissíteni,
- **előfeltétel hiányzik** — hiányzik egy szükséges bemenet.

A web crawleres lépések extra mezőket is kapnak:

- `isCrawler`
- `safetyPolicyLabel`
- `sanityState`
- `requiresConfirmation`

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
- a futási állapot workspace-szintű progresszként érkezik a GUI-ba,
- a logfolyam websocket push eseményként megmarad, de nem ez az elsődleges állapotábrázolás,
- aktív futás közben egy újabb mutáló kérés 409 hibát kap,
- a pipeline read-only állapotlekérdezése ettől még elérhető marad.

## Gyors editor-visszajelzés

A Primer audit szerkesztőből indított közös nap mentése nem a teljes, nehéz frissítési láncot várja meg, hanem gyorsított auditfrissítést indít:

1. végső primer feloldása,
2. végső primer riport,
3. primer nélkül maradó nevek riport,
4. primer audit riport.

Ez gyorsabb visszajelzést ad a szerkesztés után, miközben a teljes pipeline-futás továbbra is külön indítható.
