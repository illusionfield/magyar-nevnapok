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

## Fő folyamat

1. legacy primerjegyzék építése a régi ICS-ből,
2. wiki primerjegyzék gyűjtése,
3. végső primer-feloldás,
4. teljes névadatbázis építése,
5. formalizált él-lista generálása,
6. ICS kimenet,
7. auditok és riportok.

## Kiemelt auditok

- `vegso-primer` — a végső primerjegyzék teljes diagnosztikája,
- `primer-nelkul-marado-nevek` — havi bontásban mutatja azokat a normalizált és rangsorolt neveket, amelyek a teljes végső primerkészletből kimaradnak,
- `hivatalos-nevjegyzek` — a dokumentált kivétellistával kezelt hivatalos névjegyzék-összevetés.
