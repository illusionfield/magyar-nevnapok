# Architektúra és domainhatárok

## Fő rétegek

### `web/server/`

Az Express-alapú HTTP + websocket réteg.

Feladatai:

- SPA kiszolgálás fejlesztői és buildelt módban,
- websocket szerződés kezelése,
- mutáló műveletek jobkezelése,
- letöltési tokenek kiosztása,
- szemantikus workspace DTO-k felépítése.

### `web/client/`

A React + Vite böngészős kliens.

Feladatai:

- route-alapú workspace-ek,
- websocket kapcsolat fenntartása,
- jobállapot és live log megjelenítés,
- pipeline-, audit-, primer- és ICS-editor munkafolyamatok.

### `web/shared/`

Browser-safe, megosztott nézeti logika.

Jelenleg ide került a Primer audit közös state- és view-model rétege, hogy a kliens ugyanazt a mértékadó állapotlogikát használja.

### `pipeline/`

- lépésregiszter,
- függőségek,
- manifest-frissítés,
- státuszszámítás,
- in-process workerfuttatás.

### `domainek/`

Az üzleti logika helye, domainenként szétválasztva.

- `forrasok/` — adatkinyerés és forrásadapterek
- `primer/` — primerjegyzékek, felülírások, helyi overlay
- `kapcsolatok/` — formalizált élek és kapcsolati nézetek
- `naptar/` — ICS-generálás és konfigurációs modell
- `auditok/` — riportok, összevetések, diagnosztikai ellenőrzések
- `integraciok/` — külső rendszerekhez kötődő admin műveletek

### `kozos/`

Újrahasznosítható alapszolgáltatások:

- strukturált fájlbetöltés,
- fájlrendszer-segédek,
- útvonalfeloldás,
- reporter/log adapterek.

## Fájlalapú igazságforrás

A projekt nem adatbázisra, hanem irányadó fájlokra épül:

- `data/*` — követett kézi források és kivételek,
- `.local/nevnapok.local.yaml` — nem követett helyi profil,
- `output/*` — generált kimenetek és riportok.

A web réteg ezt a modellt nem váltja le, hanem szemantikus editorokkal kezeli.
