# Áttekintés

A `magyar-nevnapok` egy böngészős GUI-val vezérelt, helyi magyar névnap build- és auditalkalmazás.

A projekt célja, hogy a magyar névnapokkal kapcsolatos forrásadatokból:

- egységes, dokumentált pipeline-t adjon,
- jól követhető kimenetkészletet állítson elő,
- webes munkaterekben tegye kezelhetővé az auditokat, a primer döntéseket és az ICS-generálást,
- miközben az igazság forrása továbbra is a fájlrendszer marad.

## Fő célok

- web-only kezelőfelület,
- websocketes frontend/backend kommunikáció,
- jól elkülönített domainhatárok,
- követhető pipeline-manifest,
- audit- és ICS-szerkesztő munkaterek,
- helyi profilalapú ICS- és primerkezelés.

## Fő futási utak

- `npm run dev` — fejlesztői webes felület indítás
- `npm run build` — webes felület build
- `npm start` — a buildelt app kiszolgálása
- `npm run data:build` — teljes adat/pipeline build
- `npm run ellenorzes` — lint + typecheck + teszt + web build

## Fő folyamat

1. legacy primerjegyzék építése a régi ICS-ből,
2. wiki primerjegyzék gyűjtése,
3. végső primer-feloldás,
4. teljes névadatbázis építése,
5. primer audit snapshot frissítése,
6. formalizált él-lista generálása,
7. naptárkimenetek előállítása,
8. auditok és riportok futtatása.

## Webes munkaterek

- **Dashboard** — operatív összkép, kapcsolat, joblog, KPI-k és gyors műveletek
- **Pipeline** — lépésenként kibontott inspector, leírások és akciógombok
- **Auditok** — auditkatalógus, részletes inspectorok és a szerkeszthető auditforrások inline editorai
- **Primer audit** — havi csoportos, táblázatos inline editor a közös és helyi primerdöntésekhez
- **ICS generálás** — teljes beállítófelület, mentett állapot + draft + előnézet + letöltés

## Fő működési elvek

- Egyszerre egyetlen mutáló job lehet aktív.
- Az aktív job állapota és logja websocket push eseményként érkezik.
- A read-only workspace lekérések aktív job mellett is elérhetők.
- A GUI nem általános fájlböngésző, hanem domain-specifikus editorokra épül.
