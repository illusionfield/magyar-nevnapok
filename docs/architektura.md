# Architektúra és domainhatárok

## Fő rétegek

### `bin/`

A tényleges futtatható indító. Feladata kizárólag a CLI indítása.

### `cli/`

A parancsfa, a súgó és a felhasználói belépési pontok definíciója.

### `tui/`

Ink-alapú interaktív réteg. Nem tartalmaz üzleti logikát, csak az alkalmazásszintű szolgáltatásokat hívja.

### `pipeline/`

- lépésregiszter,
- függőségek,
- manifest-frissítés,
- státuszszámítás.

### `domainek/`

#### `forrasok/`

A tényleges adatkinyerés és forrásadapterek helye.

#### `primer/`

A primerjegyzékek építése, betöltése és végső feloldása.

#### `nevadatbazis/`

A teljes névrekord-alapú adatbázis logikai helye.

#### `kapcsolatok/`

Formalizált élek és kapcsolati nézetek.

#### `naptar/`

ICS és egyéb jövőbeli naptárkimenetek.

#### `auditok/`

Riportok, összevetések, diagnosztikai ellenőrzések.

#### `integraciok/`

Külső rendszerekhez kapcsolódó adminisztratív műveletek.

### `kozos/`

Újrahasznosítható alapszolgáltatások:

- strukturált fájlbetöltés,
- sémaellenőrzés,
- fájlrendszer-segédek,
- táblázatos terminálkimenet,
- folyamatindítás.
