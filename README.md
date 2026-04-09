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

A régi, tisztított `data/nevnapok_tisztitott_regi_nevkeszlet.ics` fájlból külön legacy primer-jegyzék építhető:

```bash
  npm run build-primary-registry
```

Alapértelmezett kimenet:

```text
  output/legacy-primary-registry.json
```

Ez a jegyzék napokra bontva eltárolja:

- `month`
- `day`
- `monthDay`
- `names`
- `preferredNames` — legfeljebb 2 név, a legacy sorrend szerint
- `sourceFile`

A scraper ezt a JSON-fájlt csak a `primaryLegacy` jelölésekhez használja. Ez diagnosztikai forrás marad, nem ez adja a végső `primary` mezőt.

A legacy primer egyezőség külön riportáló teszttel ellenőrizhető:

```bash
  npm run test:primary-registry
```

Ez összeveti:

- az `output/legacy-primary-registry.json` napjait,
- az aktuális `output/nevnapok.json` napi névhalmazát,
- az abból képzett `primaryLegacy` jelöléseket,
- és a számított, ranking alapú `primaryRanked` jelöléseket is.

A teszt diff-riportot ír ide:

```text
  output/primary-registry-diff.json
```

A riportoló teszt parse- vagy szerkezeti hibánál hibával áll le, tartalmi eltérésnél viszont csak összesíti az egyezőségi arányt és a különbségeket. A konzolra a legnagyobb primereltérésű napok rövid top-listáját is kiírja.

## Wikipédia primer registry scraper

Van külön scraper a magyar Wikipédia névnapos napjaihoz is:

```bash
  npm run wiki
```

Alapértelmezett kimenet:

```text
  output/wiki-primary-registry.json
```

Ez a `https://hu.wikipedia.org/wiki/Kategória:Az_év_napjai` oldal naplinkjeit gyűjti ki, majd minden napoldalon a `Névnapok` sorból épít ugyanilyen szerkezetű registryt:

- `month`
- `day`
- `monthDay`
- `names`
- `preferredNames`

A Wikipédia-oldalakon a félkövérre emelt nevek kerülnek a `preferredNames` mezőbe.

Opcionális kapcsolók:

```bash
  npm run wiki -- --output output/wiki-primary-registry.json
  npm run wiki -- --limit 5
  npm run wiki -- --concurrency 8
  npm run wiki -- --headful
```

Megjegyzés: a kategóriaoldal jelenleg 2026-os naptárnézetet ad, ezért a scraper 365 naplinket talál. A generátor ehhez külön szökőéves kivételt alkalmaz, és a `02-29` bejegyzést a `02-28` névnapjaiból levezeti, így a végső wiki registry már 366 napos.

A legacy és a wiki primer registry külön összevethető:

```bash
  npm run test:wiki-primary-registry
```

Alapértelmezett bemenetek:

- `output/legacy-primary-registry.json`
- `output/wiki-primary-registry.json`

A riport ide készül:

```text
  output/legacy-vs-wiki-primary-registry-diff.json
```

A teszt összesíti a teljes nap-egyezéseket, a részleges átfedéseket, a primereltéréseket, és kiírja a teljes primerkülönbség-listát.

## Végső primer registry

A legacy és a wiki primer-jegyzék fölé jön egy kézi override-réteg is:

```text
  data/primary-registry-overrides.json
```

Ebben a legacy–wiki primereltérések kézzel rögzített, irányadó napjai szerepelnek. A végső primer registry így építhető fel:

```bash
  npm run build:primary-registry
```

Alapértelmezett bemenetek:

- `output/legacy-primary-registry.json`
- `output/wiki-primary-registry.json`
- `data/primary-registry-overrides.json`

Alapértelmezett kimenet:

```text
  output/primary-registry.json
```

A builder napi szabálya:

1. ha van kézi override, az az irányadó,
2. ha a legacy és a wiki pontosan egyezik, az a végső primer,
3. ha eltérés marad és nincs override, akkor `warning-union` forrásból a legacy + wiki uniója megy tovább.

A napi rekordok a végső `preferredNames` mellett megtartják a forrásbontást is:

- `names`
- `preferredNames`
- `legacyNames`
- `wikiNames`
- `overrideNames`
- `source`
- `warning`

A scraper most már ezt a végső registryt használja a tényleges `primary` jelöléshez. Emellett a JSON-ban külön megmaradnak a diagnosztikai mezők is:

- `primaryRegistry`
- `primaryLegacy`
- `primaryRanked`
- `registryOrder`
- `legacyOrder`

A végső primer registry külön havi bontású, színezett riporttal is ellenőrizhető:

```bash
  npm run test:final-primary-registry
```

Alapértelmezett bemenetek:

- `output/primary-registry.json`
- `output/legacy-primary-registry.json`
- `output/wiki-primary-registry.json`
- `output/unified-primary-report.json`
- `output/nevnapok.json`

A riport ide készül:

```text
  output/final-primary-registry-report.json
```

A teszt:

- hónaponként külön táblát ír,
- februárnál külön kiemeli a `02-24`–`02-29` sávot,
- mutatja a `Legacy`, `Wiki`, `Normalized`, `Ranking` és `Rejtett` oszlopokat,
- külön listázza a teljes `Primary nélkül maradó nevek` halmazt,
- és ezt havi bontásban is megjeleníti, így gyorsan látszik, mely nevek vesznek el, ha csak a primary naptárat importálod,
- külön `hasonló primerek` táblát is ad ezekhez a rejtett nevekhez, ahol a rokon/becézett kapcsolatokból látszik, mely primer esemény leírásába lehet érdemes beemelni őket,
- a hasonló primer táblában azt is mutatja, hogy az adott primer napjain hány primer van összesen, és mennyi egyéb névnap esik még arra a napra,
- ellenőrzi a 25 kézi override napot,
- és összesíti a névgyakorisági és napi elemszám-eloszlási szélsőértékeket is.

## Primer normalizáló

Van külön normalizáló a véglegesített primerlista előállítására:

```bash
  npm run normalize:primary
```

Alapértelmezett bemenetek:

- `output/nevnapok.json`
- `output/legacy-vs-wiki-primary-registry-diff.json`

Alapértelmezett kimenet:

```text
  output/unified-primary-report.json
```

A normalizáló úgy állít elő egy egységes primer-jegyzéket, hogy:

1. a `nevnapok.json` napi névjelöltjeiből felépít egy adatbázisoldali jelöltlistát,
2. a legacy–wiki diffből beolvassa a primereltéréses napokat,
3. névnormalizálást alkalmaz az írásmódbeli eltérésekre,
4. a szökőévre érzékeny februári napokra kézi kivételt használ,
5. és napokra bontva dönt arról, hogy a primernév
   - közvetlenül az adatbázisból,
   - legacy fallbackből,
   - metszetből,
   - vagy kézi felülbírálásból jön.

A kimenet felső szintű `days` tömbje registry-kompatibilis marad, tehát tartalmazza a szokásos:

- `month`
- `day`
- `monthDay`
- `names`
- `preferredNames`

mezőket, de emellett döntési metaadatokat is hordoz, például `source`, `confidence`, `reason`, `databaseCandidates`, `preferredMismatch`.

Példák:

```bash
  npm run normalize:primary -- --input output/nevnapok.json --diff output/legacy-vs-wiki-primary-registry-diff.json
  npm run normalize:primary -- --output output/unified-primary-report.json
```

A script a korábbi pozíciós hívásmódot is megtartja:

```bash
  node primary-normalizer.js output/nevnapok.json output/legacy-vs-wiki-primary-registry-diff.json output/unified-primary-report.json
```

A normalizált primer-jegyzék külön össze is vethető a legacy és a wiki registryvel:

```bash
  npm run test:primary-normalizer
```

Alapértelmezett bemenetek:

- `output/unified-primary-report.json`
- `output/legacy-primary-registry.json`
- `output/wiki-primary-registry.json`

A riport ide készül:

```text
  output/primary-normalizer-diff.json
```

A teszt ugyanúgy kiírja a napegyezési és primerfedési összesítéseket, mint a legacy–wiki összevető script, és külön listázza a teljes primereltérés-listát a

- normalizált vs. legacy
- normalizált vs. wiki

párokra is.

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


## Tesztek és riportok részletesen

Az adatfolyamban több külön ellenőrző script van, és ezek **nem ugyanazt** vizsgálják. Az alábbi összefoglaló azt mutatja meg, hogy melyik teszt mire való, milyen forrásból dolgozik, mit ír ki, és az egyes mutatók mit jelentenek.

### Gyors áttekintés

| Script | Cél | Alap kimenet | Hibakód |
| --- | --- | --- | --- |
| `npm test` | hivatalos HUN-REN névlisták vs. `nevnapok.json` | nincs külön JSON riport | **igen**, ha eltérés van |
| `npm run test:primary-registry` | legacy registry vs. aktuális JSON + legacy primary vs. ranking primary | `output/primary-registry-diff.json` | csak szerkezeti hibánál |
| `npm run test:wiki-primary-registry` | legacy registry vs. wiki registry | `output/legacy-vs-wiki-primary-registry-diff.json` | csak szerkezeti hibánál |
| `npm run test:primary-normalizer` | normalizált primerjegyzék vs. legacy és wiki | `output/primary-normalizer-diff.json` | csak szerkezeti hibánál |
| `npm run test:final-primary-registry` | végső primer registry teljes havi ellenőrzése | `output/final-primary-registry-report.json` | csak szerkezeti / validációs hibánál |

### `npm test` — hivatalos HUN-REN névjegyzék-összevetés

Ez a legszigorúbb teszt: azt nézi, hogy az `output/nevnapok.json` névlistája mennyire egyezik a két hivatalos utónévlistával.

Források:

- férfi: `https://file.nytud.hu/osszesffi.txt`
- női: `https://file.nytud.hu/osszesnoi.txt`

A fő táblázat oszlopai:

- `Nem` — férfi vagy női lista
- `Hivatalos` — ennyi név van a hivatalos forrásban
- `JSON` — ennyi név van az aktuális `nevnapok.json`-ban az adott nemhez
- `Hiányzik` — hány hivatalos név nincs benne a JSON-ban
- `Többlet` — hány JSON-beli név nincs benne a hivatalos listában
- `Másik listában` — a többletből hány név található meg a másik nem hivatalos listájában

Az egyes nemek alatti részletes blokkokban:

- `Hivatalos fejléc` — a letöltött TXT első sora, ellenőrzéshez
- `HIÁNYZIK A JSON-BÓL` — konkrétan mely nevek hiányoznak
- `TÖBBLET A JSON-BAN` — konkrétan mely nevek vannak pluszban
- `A többletből a másik hivatalos listában` — potenciális nemváltási vagy forráseltérési gyanúk

Ez a teszt **nem nulla kilépési kóddal leáll**, ha bármelyik listán van hiány vagy többlet.

### `npm run test:primary-registry` — legacy registry vs. aktuális JSON

Ez a teszt két külön dolgot ellenőriz:

1. a legacy primer registry napjai mennyire fedik az aktuális `nevnapok.json` napi névhalmazát,
2. a legacy alapú primerjelölés (`primaryLegacy`) mennyire egyezik a ranking alapú jelöléssel (`primaryRanked`).

#### 1. blokk: `LEGACY REGISTRY VS. JSON`

Mutatók:

- `Registry napok` — hány nap van a legacy registryben
- `Aktuális JSON napok` — hány nap szerepel a mostani `nevnapok.json`-ban
- `Teljes részhalmaz-egyezés` — hány napnál van benne **minden** legacy név az aktuális napi névhalmazban
- `Ebből pontos napi egyezés` — a részhalmaz-egyezések közül hány napnál **pont ugyanaz** a névhalmaz, nincs plusz név
- `Részleges egyezés` — van átfedés, de legalább egy legacy név hiányzik
- `Nincs egyezés` — a legacy napi névhalmazból semmi nem található meg az adott aktuális napban
- `Legacy névegyezés` — összesített névszintű fedés: `találat / összes legacy név`
- `Legacy primer egyezés` — ugyanez, de csak a `preferredNames`-re
- `Hiányzó legacy nevek` — összesen hány legacy név nem található meg a megfelelő jelenlegi napon
- `Legacy primer hiányos napok` — hány napon hiányzik legalább egy legacy primer az aktuális `primaryLegacy` mezőből

A `Legacy primerhiányos napok` táblában:

- `Nap` — a hónap-nap kulcs
- `Legacy primer` — mit vár a legacy registry
- `JSON legacy` — mi lett ténylegesen `primaryLegacy`
- `Hiányzik` — a legacy primerből mi nem jelent meg a JSON-ban

#### 2. blokk: `LEGACY PRIMARY VS. SZÁMÍTOTT PRIMARY (RANKING)`

Ez már nem a teljes napi névhalmazt, hanem két primerforrást vet össze:

- `primaryLegacy`
- `primaryRanked`

Eltéréstípusok:

- `Pontos egyezés` — ugyanaz a primernévhalmaz
- `Részleges átfedés` — van közös primernév, de nem ugyanaz a teljes lista
- `Teljes eltérés` — mindkét oldalon van primer, de nincs közös név
- `Csak legacy van` — aznap csak `primaryLegacy` jelölés van
- `Csak számított ranking van` — aznap csak `primaryRanked` jelölés van

A fedési mutatók:

- `Közös primary nevek legacyhoz képest` — a legacy primernevek mekkora része jelenik meg a rankingben is
- `Közös primary nevek rankinghez képest` — a ranking primernevek mekkora része jelenik meg a legacyban is

Az `eltérő napok` táblában:

- `Legacy` — legacy szerinti primernevek
- `Ranking` — ranking szerinti primernevek
- `Részletek` — közös / csak legacy / csak ranking bontás

### `npm run test:wiki-primary-registry` — legacy vs. wiki registry

Ez a teszt két primer registryt vet össze ugyanarra a napkulcs-készletre:

- `output/legacy-primary-registry.json`
- `output/wiki-primary-registry.json`

A fő összesítő blokk jelentése:

- `Legacy napok`, `Wiki napok` — hány nap van a két registryben
- `Közös napok` — hány napkulcs szerepel mindkettőben
- `Csak legacy napok`, `Csak wiki napok` — csak az egyik forrásban meglévő napok
- `Pontos névegyezésű napok` — a teljes `names` halmaz egyezik
- `Részleges névátfedésű napok` — a teljes `names` halmaz csak részben fedi egymást
- `Teljes néveltérésű napok` — a teljes `names` halmazok között nincs közös név
- `Legacy névfedés wikihez képest` — a legacy névhalmaz mekkora része található meg a wikiben
- `Wiki névfedés legacyhoz képest` — a wiki névhalmaz mekkora része található meg a legacyban
- `Pontos primer-egyezésű napok` — a `preferredNames` teljesen egyezik
- `Részleges primerátfedésű napok` — a `preferredNames` részben egyezik
- `Teljes primereltérésű napok` — nincs közös primernév

A `Primereltérésű napok` táblában:

- `Legacy` — a legacy primerlista
- `Wiki` — a wiki primerlista
- `Részletek` — közös / csak legacy / csak wiki név

Ez a teszt riportoló jellegű: a különbségeket kiírja, de tartalmi eltérés miatt nem áll meg hibával.

### `npm run test:primary-normalizer` — normalizált primerjegyzék összevetése

Ez a teszt a normalizáló kimenetét vizsgálja:

- `output/unified-primary-report.json`

és külön összeveti:

- a legacy registryvel
- a wiki registryvel

#### `PRIMER NORMALIZÁLÓ` blokk

Ez a blokk magának a normalizálónak a döntési összegzését mutatja:

- `Napok` — hány napja van a normalizált registrynek
- `Primer nevek` — összesen hány primerbejegyzés készült
- `Legacyből közvetlenül` — hány nap döntése jött közvetlen legacy átvételből
- `Adatbázisból közvetlenül` — hány nap döntése jött közvetlenül a `nevnapok.json` napi jelöltjeiből
- `Kézi szökőéves felülbírálás` — hány napra ment kézi februári kivétel
- `Kézi átnézésre vár` — hány nap maradt konfliktusos
- `Függőben maradt` — hány napot nem tudott végleg eldönteni
- `Review queue` — a kézi döntést igénylő sorok száma

#### `NORMALIZÁLT VS. LEGACY REGISTRY` és `NORMALIZÁLT VS. WIKI REGISTRY`

Mindkét blokk ugyanazt a logikát használja:

- teljes napi névhalmaz-fedés
- primerfedés
- csak egyik oldalon létező napok
- primereltérés-lista

Az eltéréstípusok ugyanazok, mint a legacy–wiki tesztnél:

- pontos egyezés
- részleges átfedés
- teljes eltérés
- csak bal oldal
- csak jobb oldal

A primereltérésű napok táblája azt mutatja meg, hogy a normalizált `preferredNames` mennyire közelít a legacyhoz vagy a wikihez.

### `npm run test:final-primary-registry` — végső primer registry teljes riport

Ez a legbővebb ellenőrző teszt. A végső, kézzel felülbírált primer registryt mutatja be együtt a többi forrással:

- végső primer registry
- legacy
- wiki
- normalized
- ranking
- teljes `nevnapok.json`

#### `Validációs összegzés`

Itt a builder és az override-réteg konzisztenciája látszik:

- `Végső napok száma` — elvárt érték: 366
- `Warning-union napok` — hány olyan nap maradt, ahol override nélkül legacy+wiki uniót kellett használni
- `Override napok` — hány kézi irányadó nap van
- `Legacy–wiki primereltéréses napok` — hány nap tér el a két forrás között
- `Duplikált override napok` — hibás override fájl esetén nem üres
- `Hiányzó override napok` — ahol van legacy–wiki primereltérés, de nincs kézi override
- `Extra override napok` — override-ban benne van, de nincs tényleges legacy–wiki eltérés
- `Érvénytelen override nevek` — override név, amely sem legacyban, sem wikiben nem szerepel az adott nap primerjeként
- `Kemény hibák` — szerkezeti vagy elvárt állapotot sértő hibák száma

#### `Kötelező mintanapok`

Ez egy sanity check az ismert, kézzel rögzített napokra.

- `Elvárt` — a fixen várt primerek
- `Tényleges` — amit a végső builder előállított
- `Állapot` — `ok` vagy `hiba`

#### Havi táblák

Minden hónapnak külön napi táblája van. Oszlopok:

- `Dátum` — `MM-DD`
- `Nevek` — a napi primerjelöltek teljes uniója: override + legacy + wiki
- `Legacy` — legacy `preferredNames`
- `Wiki` — wiki `preferredNames`
- `Normalized` — a normalizáló aznapi `preferredNames` listája
- `Ranking` — az `output/nevnapok.json` alapján számított `primaryRanked`
- `Rejtett` — azok a nevek, amelyeknek van névnapjuk azon a napon, de a végső primer registryben **egyetlen napon sem** lesznek primaryk

Színezés:

- zöld — legacy és wiki egyezik, és a végső primer is ezt követi
- sárga — kézi override-os nap
- piros — `warning-union` nap
- halvány — üres / hiányos sor

Februárnál külön mini-tábla is van a `02-24`–`02-29` sávra.

#### `Primary nélkül maradó nevek`

Ez a teljes globális lista azokról a nevekről, amelyek:

- szerepelnek a `nevnapok.json`-ban,
- van legalább egy névnapjuk,
- de a végső primer registry `preferredNames` mezőjében **sehol** nem szerepelnek.

Ha csak a primary naptárat importálod, ezek a nevek nem fognak megjelenni.

Oszlopok:

- `Név`
- `Napok` — hány névnapja van összesen
- `Névnapjai` — mely napokon fordul elő

Ugyanez havi bontásban is megjelenik.

#### `Primary nélkül maradó nevek – hasonló primerek`

Ez a táblázat azt segíti eldönteni, hogy egy elvesző nevet melyik primer esemény leírásába érdemes beemelni.

A hasonlóság alapja:

- a név saját `relatedNames`
- a név saját `nicknames`
- és a visszahivatkozó kapcsolatok is, ha egy primer név ezek között hivatkozik a rejtett névre

Oszlopok:

- `Rejtett név` — a primary nélkül maradó név
- `Saját napok` — ennyi névnapja van ennek a rejtett névnek
- `Hasonló primary` — melyik végső primerhez kapcsolható
- `Kapcsolat` — saját rokon/becézés vagy visszahivatkozás
- `Primary napjai` — a jelölt primer összes primerdátuma
- `1 primeres` — a primer dátumai közül hány olyan van, ahol aznap csak 1 primary szerepel; ezek a legjobb „mellé befér” jelöltek
- `Primer darab` — összesítő, hogy a primer dátumain hány primary van, például `1p×2 • 2p×1`
- `Egyéb névnap` — a primer dátumain még hány nem-primer névnap esik az adott napokra

#### `Névfrekvenciás szélsőértékek`

Metrikák:

- `Összes névnap` — hány napon szerepel egy név összesen
- `Végső primer` — hány napon final primary
- `Legacy primer`
- `Wiki primer`
- `Normalized primer`
- `Ranking primer`
- `Rejtett` — hány napon szerepel rejtettként

Mindegyiknél látszik:

- `Max` / `Legtöbb nap`
- `Min` / `Legkevesebb nap`

#### `Napi elemszám-eloszlás`

Ez azt mutatja meg, hogy egy adott primer-variáció esetén hány napra esik:

- 0 név
- 1 név
- 2 név
- 3 név
- stb.

Variációk:

- `primary-registry`
- `legacy`
- `wiki`
- `normalized`
- `ranking`
- `hidden`

### Melyik tesztet mikor érdemes futtatni?

- **Scrape után először**: `npm test`  
  Ha a hivatalos névlista integritása a fontos.

- **Primerforrások ellenőrzésére**: `npm run test:wiki-primary-registry`  
  Ha a legacy és a wiki közti nyers primereltéréseket akarod látni.

- **Legacy kompatibilitásra**: `npm run test:primary-registry`  
  Ha azt akarod látni, hogy a jelenlegi adatbázis mennyire követi a legacy primeket, és mennyire tér el tőlük a ranking.

- **Normalizáló finomhangolásra**: `npm run test:primary-normalizer`  
  Ha a normalizált jelölések legacy/wiki közelsége érdekel.

- **Naptárba ténylegesen használt primerkészletre**: `npm run test:final-primary-registry`  
  Ha azt akarod átnézni, mi látszik majd a primary naptárban, mi marad rejtve, és mely rejtett neveket lehet érdemes primer leírásokba beemelni.


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

Ebben a módban a generátor ismétlődő eseményeket ír `RRULE` + `EXDATE` + `RDATE` kombinációval, így a szökőéves február 24–29. eltérés pontos marad, és a fájlméret nem száll el. Google Calendar alatt ez működik, Apple Calendar kompatibilitása viszont külön ellenőrzést igényel.

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

#### 4/a. Szökőéves stratégia: A, B vagy mindkettő

Alapértelmezésben a generátor az `A` stratégiát használja:

```bash
  npm run ics -- --leap-mode hungarian-until-2050 --leap-strategy a
```

Ez a jelenlegi:

- `RRULE + EXDATE + RDATE`

A `B` stratégia `RECURRENCE-ID` kivételes előfordulásokat használ:

```bash
  npm run ics -- --leap-mode hungarian-until-2050 --leap-strategy b
```

Ez a gyakorlatban ezt jelenti:

- van egy ismétlődő mesteresemény,
- és csak a tényleg eltérő szökőéves napok kapnak külön kivételes rekordot.

Ha mindkettőt le akarod gyártani összehasonlításhoz, használhatod ezt:

```bash
  npm run ics -- --leap-mode hungarian-until-2050 --leap-strategy both
```

Ilyenkor az alap `--output` útvonalból két fájl készül:

```text
  output/nevnapok-A.ics
  output/nevnapok-B.ics
```

Ha a Mac Naptár az `A` stratégiával nem jeleníti meg helyesen a február 25–29. szökőéves eltérést, érdemes a `B` stratégiát kipróbálni.

## Apple Calendar kompatibilitási tesztmátrix

Az Apple Naptár importja a gyakorlatban nem feltétlen kezeli ugyanúgy a szökőéves ismétlődéseket, mint a Google Calendar. Emiatt van külön tesztmátrix-generátor három stratégia összehasonlítására:

```bash
  npm run test:apple-compat
```

Alapértelmezett kimenet:

```text
  output/apple-calendar-compat/
```

A script ezeket állítja elő:

- `A-rrule-exdate-rdate.ics` — a jelenlegi RFC-szerű megközelítés
- `B-rrule-recurrence-id.ics` — ismétlődő mesteresemény + `RECURRENCE-ID` kivételek
- `C-explicit-yearly.ics` — évesen duplikált kontrollfájl
- `manifest.json` — rövid összefoglaló a generált fájlokról

Az alap vizsgálati tartomány:

- `2026`–`2032`
- szökőévek a mintában: `2028`, `2032`
- csak a február `24–28.` forrásnapok, mert itt jelentkezik az eltolás

A cél az, hogy ugyanazt a logikát három külön ICS-reprezentációban lehessen importálni, és gyorsan kiderüljön, hogy a Mac Naptár melyiket jeleníti meg helyesen.

Ha kell, a tartomány felülírható:

```bash
  npm run test:apple-compat -- --from-year 2026 --until-year 2032
```

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

Naponta egy esemény, szökőéves eltolással 2050-ig, `B` stratégiával és az év sorszámával a címben:

```bash
  npm run ics -- \
    --mode together \
    --description compact \
    --leap-mode hungarian-until-2050 \
    --leap-strategy b \
    --ordinal-day summary
```

Teljes build:

```bash
npm run build-primary-registry
npm run wiki
npm run build:primary-registry
npm run scrape -- --output output/nevnapok.json

npm run ics -- \
  --input output/nevnapok.json --output output/nevnapok.ics \
  --split-primary-rest --primary-source default --primary-calendar-mode separate --rest-calendar-mode grouped \
  --leap-mode hungarian-until-2050 --from-year 2025 --until-year 2040 \
  --description detailed --description-format text --ordinal-day description --include-other-days
```

## Megjegyzés a fájlméretről

A szökőéves mód két stratégiát tud használni:

- `A`: `RRULE` + `EXDATE` + `RDATE`
- `B`: `RRULE` + `RECURRENCE-ID` kivételek

A `B` stratégia sem évenként duplikál mindent: csak a tényleg eltérő szökőéves előfordulások kerülnek külön rekordba.

Ez azt jelenti, hogy:

- `--mode together` esetén továbbra is csak napi eseményszám, illetve `B` stratégiánál kevés kivételes rekord keletkezik,
- `--mode separate` esetén a fájl még mindig jelentősen nagyobb lehet, de nem azért, mert minden év külön eseményt kap.
