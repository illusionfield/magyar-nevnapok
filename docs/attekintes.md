# Áttekintés

A `magyar-nevnapok` egy böngészős GUI-val vezérelt, helyi magyar névnap build-, audit- és karbantartó alkalmazás.

A projekt célja, hogy a magyar névnapokkal kapcsolatos forrásadatokból:

- egységes, dokumentált pipeline-t adjon,
- jól követhető kimenetkészletet állítson elő,
- több különböző nézetből is összevesse ugyanazt a névanyagot,
- webes munkaterekben tegye kezelhetővé az auditokat, a primer döntéseket és az ICS-generálást,
- miközben az igazság forrása továbbra is a fájlrendszer marad.

## Fő célok

- web-only kezelőfelület,
- websocketes frontend/backend kommunikáció,
- jól elkülönített domainhatárok,
- követhető pipeline-manifest,
- audit- és ICS-szerkesztő munkaterek,
- adminisztratív, gyorsan áttekinthető GUI,
- többforrású validáció és eltérésfigyelés,
- helyi profilalapú ICS- és primerkezelés.

## Fő futási utak

- `npm run dev` — fejlesztői webes felület indítás
- `npm run build` — webes felület build
- `npm start` — a buildelt app kiszolgálása
- `npm run data:build` — teljes adat/pipeline build, ICS generálás nélkül
- `npm run ellenorzes` — lint + typecheck + teszt + web build

## Fő folyamat

1. legacy primerjegyzék építése a régi ICS-ből,
2. wiki primerjegyzék gyűjtése,
3. végső primer-feloldás,
4. teljes névadatbázis építése,
5. auditok és ellenőrző riportok frissítése,
6. primer audit snapshot és szerkesztői nézet előállítása,
7. formalizált él-lista generálása,
8. formalizált és auditkísérő kimenetek lezárása.

## Webes munkaterek

- **Dashboard** — primer- és auditközpontú irányítópult a teendők, a havi primerállapot, az auditfigyelmek és a pipeline összkép áttekintésére
- **Pipeline** — csoportos admin nézet közérthető státuszokkal és célzott futtatással
- **Auditok** — auditkatalógus, fluid részletnézetek és a szerkeszthető auditforrások inline editorai
- **Primer audit** — havi csoportos, táblázatos inline editor a közös és helyi primerdöntésekhez
- **ICS generálás** — live mentésű beállítófelület, havi accordionos táblázatos előnézet, névszintű részletek és letöltés

## Fő működési elvek

- Egyszerre egyetlen mutáló job lehet aktív.
- Az aktív job állapota strukturált workspace-progresszként érkezik.
- A logfolyam megmarad, de már nem ez a felület elsődleges visszajelzése.
- A read-only workspace lekérések aktív job mellett is elérhetők.
- A GUI nem általános fájlböngésző, hanem domain-specifikus editorokra épül.
