# Pipeline és manifest

## Irányadó lépések

A pipeline audit-first láncra van rendezve. A projekt fő folyamatai a következők:

1. `legacy-primer-epites`
2. `wiki-primer-gyujtes`
3. `vegso-primer-feloldas`
4. `portal-nevadatbazis-epites`
5. `audit-wiki-vs-legacy`
6. `audit-primer-normalizalo-alap`
7. `audit-primer-normalizalo`
8. `audit-vegso-primer`
9. `audit-primer-nelkul-marado-nevek`
10. `audit-primer-audit`
11. `formalizalt-elek-generalasa`
12. `audit-hivatalos-nevjegyzek`
13. `audit-legacy-primer`

A sorrend lényege:

- előbb megszülessen a primerforrásokból a **végső primer**,
- legyen friss az adatbázis-alap, amelyre több audit is támaszkodik,
- utána frissüljenek a **külön auditok**,
- és csak ezután készüljön el a **primer editor snapshot**.

Az ICS-generálás **nem a pipeline része**. Az ICS a külön `/ics` munkatéren kérhető előnézettel és letöltéssel.

## Pipeline-csoportok

A GUI és a websocket API csoportos admin nézetet használ, de a csoportosítás nem írja felül a szakmai auditprioritást.

A jelenlegi fő csoportok:

- `forrasok-es-alapadatok`
- `primer-audit`
- `auditok`

Az `auditok` csoporton belül a blokkoló auditok előre kerülnek, hogy a szakember először a primer minőségét közvetlenül érintő hibákat lássa.

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

## Audit-first gyors frissítés

A primer editorból indított közös nap mentése nem a teljes nehéz láncot futtatja újra, hanem csak a szerkesztői visszajelzéshez szükséges auditláncot.

A gyors frissítés lépései:

1. `vegso-primer-feloldas`
2. `audit-vegso-primer`
3. `audit-primer-nelkul-marado-nevek`
4. `audit-primer-audit`

Ez a **gyors frissítés** szándékosan rövid:

- a primerdöntés hatása gyorsan visszalátszik,
- a külön auditok azonnal frissülnek,
- a primer editor snapshot naprakész lesz,
- de az adatbázis- és exportlánc nem indul el fölöslegesen.

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

A manifest nem auditmagyarázó dokumentum, hanem futás- és frissességkövető nyilvántartás. A szakmai indoklást a külön auditriportok hordozzák.

## Job-integráció

A web réteg a pipeline futtatást központi jobként indítja.

Ennek következményei:

- egyszerre csak egy mutáló futtatás lehet aktív,
- a futási állapot workspace-szintű progresszként érkezik a GUI-ba,
- a logfolyam websocket push eseményként megmarad, de nem ez az elsődleges állapotábrázolás,
- aktív futás közben egy újabb mutáló kérés 409 hibát kap,
- a pipeline read-only állapotlekérdezése ettől még elérhető marad.
