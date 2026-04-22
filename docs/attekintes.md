# Áttekintés

A `magyar-nevnapok` egy böngészős GUI-val vezérelt, helyi magyar névnap audit-, primer- és exportalkalmazás.

A projekt elsődleges célja nem pusztán egy admin felület biztosítása, hanem az, hogy a magyar névnapforrásokból:

- **teljes auditálhatóságot** adjon,
- **kiterjesztett, szakmailag használható primer adatbázist** állítson elő,
- a primerdöntések mögé **forrásbizonyítékot** tegyen,
- a szakembereknek gyorsan áttekinthető, mégis részletes webes munkateret adjon,
- miközben az igazság forrása továbbra is a fájlrendszer marad.

## Fő célok

- web-only kezelőfelület,
- websocketes frontend/backend kommunikáció,
- jól elkülönített domainhatárok,
- audit-first pipeline,
- elsőrangú külön auditok,
- primer editor snapshot visszakötve a forrásauditokhoz,
- blokkoló eltérések gyors láthatósága,
- helyi profilalapú ICS- és primerkezelés.

## Fő futási utak

- `npm run dev` — fejlesztői webes felület indítás
- `npm run build` — webes felület build
- `npm start` — a buildelt app kiszolgálása
- `npm run data:build` — teljes adat/pipeline build, ICS generálás nélkül
- `npm run ellenorzes` — lint + typecheck + teszt + web build

## Irányadó folyamat

1. legacy primerjegyzék építése a régi ICS-ből,
2. wiki primerjegyzék gyűjtése,
3. végső primer feloldása,
4. normalizáló alap előállítása,
5. **külön auditok** frissítése,
6. `primer-audit` editor snapshot előállítása,
7. adatbázis és exportkimenetek lezárása,
8. igény szerint külön ICS generálás.

Ez a sorrend szándékos: a projektben a primer minősége és auditálhatósága az első, az exportok és a naptárkimenetek csak erre épülnek rá.

## Mi számít elsőrangú auditnak?

Az audit-first modellben külön, elsőrangú auditnak számít többek között:

- `vegso-primer`
- `primer-nelkul-marado-nevek`
- `primer-normalizalo`
- `wiki-vs-legacy`
- `legacy-primer`
- `hivatalos-nevjegyzek`

Ezek nem puszta háttér-összetevők. A dashboardon és az `/auditok` oldalon is saját prioritással, saját összefoglalóval és saját havi részletekkel jelennek meg.

A `primer-audit` ettől eltérő szerepű:

- **primer editor**,
- **snapshot**,
- **szintetizáló nézet**,
- de **nem az auditigazság egyetlen hordozója**.

## Webes munkaterek

- **Dashboard** — audit-first irányítópult a blokkoló auditokhoz, a kézi döntést igénylő napokhoz és a primer állapot gyors áttekintéséhez
- **Auditok** — auditkatalógus, strukturált összefoglalók, havi bontások és auditforrás-szerkesztők
- **Primer audit** — közös és helyi primerdöntések szerkesztője, forrásbizonyíték-linkekkel
- **Pipeline** — csoportos admin nézet, célzott futtatás és frissességi állapot
- **ICS generálás** — külön munkatér a konfigurációhoz, previewhoz és letöltéshez

## Fő működési elvek

- Egyszerre egyetlen mutáló job lehet aktív.
- Az aktív job állapota strukturált workspace-progresszként érkezik.
- A logfolyam megmarad, de már nem ez a felület elsődleges visszajelzése.
- A read-only workspace lekérések aktív job mellett is elérhetők.
- A GUI nem általános fájlböngésző, hanem domain-specifikus audit- és primer editorokra épül.
- A blokkoló eltérések előre sorolódnak, hogy a primer minőségét rontó hibák hamar látszódjanak.
- Az ICS nem húzza vissza a fő workflow fókuszát: külön művelet, külön munkatér, külön felelősség.
