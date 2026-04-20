# Áttekintés

A `magyar-nevnapok` célja, hogy a magyar névnapokkal kapcsolatos forrásadatokból egységes, jól követhető, dokumentált és bővíthető build-láncot adjon.

## Fő célok

- egyetlen elsődleges CLI,
- jól elkülönített domainek,
- YAML-alapú artifactok,
- követhető pipeline-manifest,
- külön audit- és kimenetgeneráló réteg,
- könnyű bővíthetőség új forrásokkal és új kimenetekkel,
- valamint stabil scraper-réteg a frissített Puppeteer-verziókkal is.

Az elsődleges névadatbázisból nemcsak ICS és strukturált YAML/JSON artifact készülhet,
hanem közvetlen CSV- és Excel-export is.

## Alap parancsok

- `npm run build` — a teljes elsődleges pipeline futtatása,
- `npm run lint` — repo-szintű lintellenőrzés,
- `npm run typecheck` — Node-alapú statikus szintaxis- és entrypoint-ellenőrzés,
- `npm test` — automatizált tesztek,
- `npm run ellenorzes` — a gyors helyi minőségellenőrzési kör.

## Fő folyamat

1. legacy primerjegyzék építése a régi ICS-ből,
2. wiki primerjegyzék gyűjtése,
3. végső primer-feloldás,
4. teljes névadatbázis építése,
5. formalizált él-lista generálása,
6. ICS kimenet,
7. auditok és riportok.

## Kiemelt auditok

- `primer-audit` — egységes primer diagnosztika a forrásnézettel, a hiányzó nevekkel és a személyes primerállapottal,
- `hivatalos-nevjegyzek` — a dokumentált kivétellistával kezelt hivatalos névjegyzék-összevetés.
