# Névnap scraper

Ez a projekt a HUN-REN Nyelvtudományi Kutatóközpont Utónévportál oldalait járja végig Puppeteerrel, majd a névadatokat név szerinti, ABC-rendbe rendezett JSON-fájlba menti. A JSON-ból az ICS generátor továbbra is tud naptárfájlt készíteni.

Forrásoldalak:

- `http://corpus.nytud.hu/utonevportal/html/nem_n%C5%91i.html`
- `http://corpus.nytud.hu/utonevportal/html/nem_f%C3%A9rfi.html`

## Két lépésből áll

1. scraper: HTML → JSON
2. generátor: JSON → ICS

## Mit csinál?

- beolvassa a női és férfi névindex-oldalakat,
- kigyűjti az összes névoldal linkjét,
- minden név saját oldaláról kigyűjti:
  - név,
  - nem,
  - eredet,
  - jelentés,
  - gyakoriság,
  - névnapok,
  - becézések,
  - rokon nevek,
  - nyelvi jellemzők,
  - formalizált eredetleírás,
- az eredményt név szerinti, ABC-rendbe rendezett JSON-ként menti.

## Használat

Telepítés:

```bash
  npm install
```

Futtatás:

```bash
  npm run scrape
```

Alapértelmezett kimenet:

```text
  output/nevnapok.json
```

## Opcionális paraméterek

Egyéni kimeneti útvonal:

```bash
  npm run scrape -- --output data/nevnapok.json
```

Csak néhány név próbaképp:

```bash
  npm run scrape -- --limit 5
```

Párhuzamosság állítása:

```bash
  npm run scrape -- --concurrency 8
```

Látható böngészővel:

```bash
  npm run scrape -- --headful
```

## Hivatalos névjegyzék-ellenőrző teszt

Van beépített összehasonlító teszt a HUN-REN hivatalos utónévlistáihoz:

```bash
  npm test
```

Ez a következő forrásokat tölti le és veti össze az aktuális `output/nevnapok.json` fájllal:

- férfinevek: `https://file.nytud.hu/osszesffi.txt`
- női nevek: `https://file.nytud.hu/osszesnoi.txt`

A teszt külön megírja:

- mi hiányzik a JSON-ból,
- mi szerepel többletként a JSON-ban,
- és nem nulla kilépési kóddal leáll, ha eltérés van.

Egyedi bemenet megadható:

```bash
  node test/compare-official-name-lists.js --input output/nevnapok.json
```

## JSON-struktúra

A kimenet felső szinten tartalmazza:

- a generálás időpontját,
- a forrásindexek URL-jeit,
- statisztikákat,
- a `names` tömböt, név szerint ABC-rendben.

Részlet egy rekordból:

```json
{
  "name": "Aglája",
  "detailUrl": "http://corpus.nytud.hu/utonevportal/html/Agl%C3%A1ja.html",
  "gender": "female",
  "origin": "Görög eredetű, mitológiai név; A három Grácia ‣ (görögül: Kháriszok) egyikének a neve",
  "meaning": "tündöklő",
  "frequency": {
    "overall": {
      "labelHu": "néhány előfordulás",
      "rank": 1,
      "tag": "1-few"
    },
    "newborns": {
      "labelHu": "néhány előfordulás",
      "rank": 1,
      "tag": "1-few"
    }
  },
  "days": [
    {
      "month": 1,
      "day": 1,
      "monthDay": "01-01",
      "primary": true
    },
    {
      "month": 5,
      "day": 14,
      "monthDay": "05-14",
      "primary": false
    }
  ],
  "nicknames": ["Ábelka", "Ábi", "Abi", "Ábika"],
  "relatedNames": ["Grácia"],
  "languageFeatures": {
    "syllableCount": 3,
    "vowelHarmony": "mély",
    "vowels": "a-á-a"
  },
  "meta": {
    "frequency": {
      "delta": 0,
      "absoluteDelta": 0,
      "direction": "flat",
      "tag": "same",
      "labelHu": "hasonló az újszülötteknél"
    }
  },
  "formalized": {
    "raw": "görög (mitológiai): \"a három Grácia ‣ egyikének a neve\" [>] ~",
    "normalized": "görög (mitológiai): \"a három Grácia egyikének a neve\" [>] ~",
    "references": ["Grácia"],
    "elements": [
      {
        "index": 0,
        "raw": "görög (mitológiai): \"a három Grácia ‣ egyikének a neve\"",
        "normalized": "görög (mitológiai): \"a három Grácia egyikének a neve\"",
        "kind": "expression",
        "uncertain": false,
        "references": ["Grácia"]
      },
      {
        "index": 1,
        "raw": "~",
        "normalized": "~",
        "kind": "self",
        "uncertain": false,
        "references": []
      }
    ],
    "operations": [
      {
        "index": 0,
        "raw": ">",
        "normalized": ">",
        "label": ">",
        "code": "derived_from",
        "qualifiers": [],
        "attributes": [],
        "canonicalized": false
      }
    ],
    "sequence": [
      { "kind": "element", "index": 0 },
      { "kind": "operation", "index": 0 },
      { "kind": "element", "index": 1 }
    ],
    "steps": [
      {
        "index": 0,
        "from": 0,
        "operation": 0,
        "to": 1
      }
    ]
  }
}
```

### `days` mező

A `days` most nem sima `MM-DD` stringlista, hanem objektumlista:

- `month`
- `day`
- `monthDay`
- `primary`

A `monthDay` pluszban maradt benne, mert szűréshez és kulcsképzéshez praktikus, miközben a numerikus `month` / `day` mezők is megvannak.

### `frequency` és `meta.frequency`

A gyakoriság most mindkét népességre külön objektum:

- `labelHu`: a forrás magyar kategóriája,
- `rank`: ritkasági / gyakorisági sorrend számmal,
- `tag`: rövid, stabil gépi címke.

A jelenlegi skála:

- `1-few`
- `2-extremely-rare`
- `3-very-rare`
- `4-rare`
- `5-medium`
- `6-very-common`
- `7-extremely-common`
- `8-top-ten`

A `meta.frequency` az össznépesség és az újszülött-gyakoriság különbségét írja le:

- `delta`: `newbornRank - overallRank`
- `absoluteDelta`
- `direction`: `down`, `flat`, `up`
- `tag`: például `down-4`, `same`, `up-2`
- `labelHu`: például `jóval ritkább az újszülötteknél`

### A `formalized` séma röviden

A formalizált eredetleírás most nem sima string, hanem géppel könnyebben feldolgozható objektum:

- `raw`: a portálról olvasott, csak whitespace-re normalizált eredeti alak,
- `normalized`: marker- és tipó-normalizált alak,
- `references`: a formalizált leírásban hivatkozott névrekordok listája,
- `elements`: a nyelvi elemek / kifejezések sorban,
- `operations`: az elemek közti műveletek, egységesített címkével és gépbarát `code` mezővel,
- `sequence`: az eredeti sorrend elemekre és műveletekre bontva,
- `steps`: a szomszédos elemek közti kapcsolatok.

Például a `megfelelője`, `női párja`, `alakvált`, `becézője`, `rövidülése`, `névalkotás` és `formája` műveletek külön mezőben, egységesítve jelennek meg.

Jelenlegi `code` értékek:

- `derived_from`
- `equivalent_of`
- `female_pair_of`
- `shape_variant`
- `diminutive_of`
- `shortening_of`
- `name_coinage`
- `form_of`
- `other`

## Formalized edge-list generálás

Külön, keresőbarát edge-list is előállítható a formalizált mezőből:

```bash
  npm run edges
```

Alapértelmezett bemenet:

```text
  output/nevnapok.json
```

Alapértelmezett kimenet:

```text
  output/formalized-edges.json
```

Egy edge rekord többek között ezt tartalmazza:

- `name`
- `relationCode`
- `relationLabel`
- `fromText`
- `toText`
- `fromNames`
- `toNames`
- `qualifiers`
- `attributes`
- `days`
- `frequency`
- `meta.frequency`
- `searchText`

## ICS előkészítéshez

A JSON név szerinti, de az ICS generátor vissza tudja belőle állítani a napi bontást a `days` mező alapján.

## ICS generálás

Alap futtatás:

```bash
  npm run ics
```

Alapértelmezett bemenet:

```text
  output/nevnapok.json
```

Alapértelmezett kimenet:

```text
  output/nevnapok.ics
```

### Fontos kapcsolók

#### 1. Az egy napra eső nevek egyben vagy külön

Egy esemény / nap:

```bash
  npm run ics -- --mode together
```

Külön esemény minden névhez:

```bash
  npm run ics -- --mode separate
```

#### 2. Legyen-e leírás, és mennyire legyen részletes

Leírás nélkül:

```bash
  npm run ics -- --description none
```

Tömör leírással:

```bash
  npm run ics -- --description compact
```

Részletes leírással:

```bash
  npm run ics -- --description detailed
```

#### 2/a. A leírás formátuma: text, html vagy full

Csak sima szöveges `DESCRIPTION`:

```bash
  npm run ics -- --description detailed --description-format text
```

Csak HTML-es `X-ALT-DESC;FMTTYPE=text/html`:

```bash
  npm run ics -- --description detailed --description-format html
```

Mindkettő:

```bash
  npm run ics -- --description detailed --description-format full
```

Alapértelmezés:

- `--description-format text`

Az ICS-be írt szabad szövegek magyarul kerülnek be, beleértve a leírás mezőcímeit és a naptárleírást is.

#### 3. Leírásban szerepeljen-e, hogy ugyanaz a név még mely napokon van

Bekapcsolva:

```bash
  npm run ics -- --include-other-days
```

Ez különösen a `--mode separate` módban hasznos.

#### 4. Február 24–29. szökőéves eltérések külön kezelése 2050-ig

Bekapcsolva:

```bash
  npm run ics -- --leap-mode hungarian-until-2050
```

Ebben a módban a generátor importbarát, ismétlődő eseményeket ír `RRULE` + `EXDATE` + `RDATE` kombinációval, így a szökőéves február 24–29. eltérés pontos marad, de a fájlméret nem száll el.

Alapértelmezett tartomány:

- kezdő év: az aktuális év,
- záró év: `2050`.

Ez felülírható:

```bash
  npm run ics -- --leap-mode hungarian-until-2050 --from-year 2026 --until-year 2050
```

Az eltolás logikája:

- normál évben:
  - `02-24` → `02-24`
  - `02-25` → `02-25`
  - `02-26` → `02-26`
  - `02-27` → `02-27`
  - `02-28` → `02-28`
- szökőévben:
  - `02-24` → `02-25`
  - `02-25` → `02-26`
  - `02-26` → `02-27`
  - `02-27` → `02-28`
  - `02-28` → `02-29`

#### 5. Az év hanyadik napja legyen-e feltüntetve

Ne szerepeljen:

```bash
  npm run ics -- --ordinal-day none
```

A cím végén, zárójelben:

```bash
  npm run ics -- --ordinal-day summary
```

A leírásban:

```bash
  npm run ics -- --ordinal-day description
```

## Gyakoribb példák

Naponta egy esemény, tömör HTML leírással:

```bash
  npm run ics -- --mode together --description compact
```

Külön esemény minden névhez, részletes leírással, további napok listájával:

```bash
  npm run ics -- --mode separate --description detailed --include-other-days
```

Naponta egy esemény, szökőéves eltolással 2050-ig, az év sorszámával a címben:

```bash
  npm run ics -- \
    --mode together \
    --description compact \
    --leap-mode hungarian-until-2050 \
    --ordinal-day summary
```

Teljes build:

```bash
npm run scrape -- --output output/nevnapok.json

npm run ics -- \
  --input output/nevnapok.json --output output/nevnapok.ics \
  --leap-mode hungarian-until-2050 --from-year 2025 --until-year 2050 \
  --description detailed --description-format text --include-other-days --ordinal-day description
```

## Megjegyzés a fájlméretről

A `--mode separate` és a `--leap-mode hungarian-until-2050` együtt nagyon nagy ICS-fájlt eredményezhet, mert minden név minden évre külön esemény lesz.
