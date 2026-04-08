# Névnap scraper

Ez a projekt a HUN-REN Nyelvtudományi Kutatóközpont Utónévportál oldalait járja végig Puppeteerrel, majd a névadatokat név szerinti, ABC-rendbe rendezett JSON-fájlba menti. A JSON-ból az ICS generátor továbbra is tud naptárfájlt készíteni.

Forrásoldalak:

- `http://corpus.nytud.hu/utonevportal/html/nem_n%C5%91i.html`
- `http://corpus.nytud.hu/utonevportal/html/nem_f%C3%A9rfi.html`

## Három részből áll

1. scraper: HTML → JSON
2. legacy primer registry: régi ICS → JSON jegyzék
3. generátor: JSON → ICS

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

## Legacy primer registry és diff-riport

A régi, tisztított `.local/nevnapok_tisztitott_regi_nevkeszlet.ics` fájl helyi, nem követett bemenet marad. Ebből külön, már követett primer-jegyzék építhető:

```bash
  npm run build-primary-registry
```

Alapértelmezett kimenet:

```text
  data/legacy-primary-registry.json
```

Ez a jegyzék napokra bontva eltárolja:

- `month`
- `day`
- `monthDay`
- `names`
- `preferredNames` — legfeljebb 2 név, a legacy sorrend szerint
- `sourceFile`

A scraper ezt a követett JSON-fájlt használja a `primaryLegacy` jelölésekhez. A `.local/...ics` fájlt nem kell és nem is érdemes verziókezelésbe venni.

A legacy primer egyezőség külön riportáló teszttel ellenőrizhető:

```bash
  npm run test:primary-registry
```

Ez összeveti:

- a `data/legacy-primary-registry.json` napjait,
- az aktuális `output/nevnapok.json` napi névhalmazát,
- az abból képzett `primaryLegacy` jelöléseket,
- és a számított, ranking alapú `primaryRanked` jelöléseket is.

A teszt diff-riportot ír ide:

```text
  output/primary-registry-diff.json
```

A riportoló teszt parse- vagy szerkezeti hibánál hibával áll le, tartalmi eltérésnél viszont csak összesíti az egyezőségi arányt és a különbségeket. A konzolra a legnagyobb primereltérésű napok rövid top-listáját is kiírja.

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
      "primary": true,
      "primaryLegacy": true,
      "primaryRanked": false,
      "legacyOrder": 1,
      "ranking": {
        "dayOrder": 3,
        "overallRank": 2,
        "newbornRank": 2,
        "overallWeight": 11,
        "newbornWeight": 12,
        "score": 23
      }
    },
    {
      "month": 5,
      "day": 14,
      "monthDay": "05-14",
      "primary": false,
      "primaryLegacy": false,
      "primaryRanked": true,
      "legacyOrder": null,
      "ranking": {
        "dayOrder": 1,
        "overallRank": 2,
        "newbornRank": 2,
        "overallWeight": 7,
        "newbornWeight": 7,
        "score": 14
      }
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

A `days` nem sima `MM-DD` stringlista, hanem objektumlista. Napokra bontva külön megmarad:

- `month`
- `day`
- `monthDay`
- `primary` — effektív elsődleges névnap
- `primaryLegacy` — a legacy primerjegyzék alapján elsődleges
- `primaryRanked` — napi ranking alapján elsődleges
- `legacyOrder` — a legacy preferált sorrend helye, ha van
- `ranking`
  - `dayOrder`
  - `overallRank`
  - `newbornRank`
  - `overallWeight`
  - `newbornWeight`
  - `score`

A `primary` szabálya: a legacy primernevek megmaradnak, és melléjük bekerülhetnek a ranking alapján kiválasztott mai elsődleges nevek is. Vagyis az effektív `primary` mező a `primaryLegacy` és a `primaryRanked` uniója.

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

Csak az elsődleges névnapok, naponként együtt:

```bash
  npm run ics -- --mode primary-together
```

Csak az elsődleges névnapok, naponként együtt, a maradék nevekkel a leírásban:

```bash
  npm run ics -- --mode primary-together-with-rest
```

Csak az elsődleges névnapok, névenként külön:

```bash
  npm run ics -- --mode primary-separate
```

Az elsődleges nevek külön, a maradék ugyanarra a napra csoportosítva:

```bash
  npm run ics -- --mode primary-separate-with-rest
```

#### 1/a. Két külön ICS a primer és a maradék neveknek

Ha két külön naptárba szeretnéd importálni az elsődleges és a maradék neveket, kapcsold be a szétválasztott kimenetet:

```bash
  npm run ics -- --split-primary-rest
```

Ilyenkor az alap `--output` útvonalból két fájl készül:

```text
  output/nevnapok-primary.ics
  output/nevnapok-rest.ics
```

A két külön kimenet csoportosítása egymástól függetlenül állítható:

```bash
  npm run ics -- \
    --split-primary-rest \
    --primary-calendar-mode separate \
    --rest-calendar-mode grouped
```

Elfogadott értékek:

- `grouped` vagy `together`
- `separate`

Ha kell, a két kimeneti fájl külön is megadható:

```bash
  npm run ics -- \
    --split-primary-rest \
    --primary-output output/elsodleges.ics \
    --rest-output output/tovabbi.ics
```

A generátor ilyenkor két külön naptárnevet is beír:

- `Névnapok — elsődleges`
- `Névnapok — további`

#### 1/b. Melyik primerforrást vegye figyelembe

Alapértelmezett viselkedés: a legacy primernevek megmaradnak, és a ranking kiegészíti őket olyan nevekkel, amelyek a legacy primerlistában nem szerepelnek:

```bash
  npm run ics -- --primary-source default
```

Csak a legacy primerjegyzéket használja:

```bash
  npm run ics -- --primary-source legacy
```

Csak a napi rankinget használja. A ranking a napi sorrendnél enyhén nagyobb súlyt ad az újszülöttkori gyakoriságnak:

```bash
  npm run ics -- --primary-source ranked
```

A legacy és a ranking unióját használja, legfeljebb 2 névvel:

```bash
  npm run ics -- --primary-source either
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

A `--description detailed --description-format text` kimenet plain textre optimalizált, keskeny nézetben is olvasható blokkos formát kap. Például:

```text
  Az év napja
  • 59. nap.
  • Szökőévben: 60. nap.

  ----[ Dénes (férfi) ]----
  További napjai
  • ápr. 6. • okt. 9.
  • nov. 17. • dec. 2.
  • dec. 26. • dec. 30.

  Eredete
  • A görög Dionüszosz névből származik

  Jelentése
  • Dionüszosznak ajánlott

  Becézései
  • Déneske • Dinci • Dini
  • Dinike

  Rokon nevek
  • Denisz • Denissza • Dienes
  • Gyenes

  Gyakoriság
  • Az újszülötteknél hasonlóan gyakori.
  • Össznépesség: közepesen gyakori.
  • Újszülöttek: közepesen gyakori.
```

Grouped módban a névblokkok között egy üres sor marad, hogy a leírás vizuálisan ne folyjon össze.

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

`--description detailed` mellett ez a leírás elején külön blokkot ad:

```text
  Az év napja
  • 1. nap.
```

Szökőéves eltérésnél:

```text
  Az év napja
  • 59. nap.
  • Szökőévben: 60. nap.
```

## Gyakoribb példák

Naponta egy esemény, tömör leírással:

```bash
  npm run ics -- --mode together --description compact
```

Külön esemény minden névhez, részletes leírással, további napok listájával:

```bash
  npm run ics -- --mode separate --description detailed --include-other-days
```

Két külön naptárfájl: az elsődleges nevek külön eseményekben, a maradék nevek naponként csoportosítva:

```bash
  npm run ics -- \
    --split-primary-rest \
    --primary-source default \
    --primary-calendar-mode separate \
    --rest-calendar-mode grouped \
    --description detailed --description-format text --include-other-days
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
npm run build-primary-registry
npm run scrape -- --output output/nevnapok.json

npm run ics -- \
  --input output/nevnapok.json --output output/nevnapok.ics \
  --split-primary-rest --primary-source default --primary-calendar-mode separate --rest-calendar-mode grouped \
  --leap-mode hungarian-until-2050 --from-year 2025 --until-year 2040 \
  --description detailed --description-format text --ordinal-day description --include-other-days
```

## Megjegyzés a fájlméretről

A jelenlegi szökőéves mód nem évenként duplikálja az eseményeket, hanem `RRULE` + `EXDATE` + `RDATE` kombinációval dolgozik.

Ez azt jelenti, hogy:

- `--mode together` esetén továbbra is csak napi eseményszám keletkezik,
- `--mode separate` esetén a fájl még mindig jelentősen nagyobb lehet, de már nem azért, mert minden év külön eseményt kap.
