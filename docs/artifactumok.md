# Kimenetek és irányadó fájlok

A projekt elsődleges kimenetei továbbra is fájlalapúak. A webes felület ezeket nem nyers fájlböngészőként mutatja, hanem szemantikus audit- és primer munkatereken keresztül teszi kezelhetővé.

## Mértékadó források

### Kézi, követett források

- `data/primary-registry-overrides.yaml` — közös, követett primerdöntések a legacy/wiki eltérések feloldására
- `data/hivatalos-nevjegyzek-kivetelek.yaml` — dokumentált kivételek a hivatalos névjegyzék auditjához

### Helyi, nem követett profil

- `.local/nevnapok.local.yaml` — helyi ICS-beállítások és helyi primer overlay

A helyi profil nem helyettesíti a közös auditokat; csak személyes réteg a közös, auditált alap fölött.

## Primerlánc kimenetei

- `output/primer/legacy-primer.yaml`
- `output/primer/wiki-primer.yaml`
- `output/primer/vegso-primer.yaml`
- `output/primer/normalizalo-riport.yaml`

Ezek közül a legfontosabb a `vegso-primer.yaml`, mert sok felhasználónál ez már közvetlenül felhasználható primer adatbázis. Emiatt a minőségét külön auditok és golden regressziós tesztek is védik.

## Elsőrangú auditriportok

A fő audit artifactumok stabil néven, az `output/riportok/` alatt jelennek meg:

- `output/riportok/vegso-primer-riport.yaml`
- `output/riportok/primer-nelkul-marado-nevek-riport.yaml`
- `output/riportok/primer-normalizalo-osszevetes.yaml`
- `output/riportok/wiki-vs-legacy.yaml`
- `output/riportok/legacy-primer-osszevetes.yaml`
- `output/riportok/hivatalos-nevjegyzek-riport.yaml`

Ezek szerepe:

- **külön audit**: önálló szakmai nézet és bizonyítási lánc,
- **forrásbizonyíték**: a dashboard, az auditkatalógus és a primer editor ezekből dolgozik,
- **blokkoló eltérés**: a primer minőségét közvetlenül érintő auditok előre sorolódnak a felületen.

Kiemelten fontos kettő:

- `vegso-primer-riport.yaml` — megmondja, hogy a végső primerjegyzék megfelel-e a rögzített igazságtáblának,
- `primer-nelkul-marado-nevek-riport.yaml` — megmutatja, mely normalizált vagy rangsorolt nevek maradtak ki teljesen a végső primerből.

## Primer editor snapshot

- `output/riportok/primer-audit.yaml`

Ez a fájl **nem a külön auditok helyettesítője**. A szerepe:

- szerkesztői snapshot,
- közös és helyi primerdöntések egyben látható nézete,
- a webes primer editor adatforrása,
- a külön auditokból származó bizonyítékok leképezése.

Gyakorlati szabály:

- ha azt kell eldönteni, hogy **miért rossz vagy vitatott** a primer, a külön auditokat kell nézni,
- ha azt kell szerkeszteni, hogy **mi legyen az eredő primerállapot**, a `primer-audit.yaml` a megfelelő nézet.

## Adatbázis és exportkimenetek

- `output/adatbazis/nevnapok.yaml`
- `output/adatbazis/nevnapok.csv`
- `output/adatbazis/nevnapok.xlsx`
- `output/adatbazis/formalizalt-elek.yaml`

Az adatbázis-kimenetek a primerláncra és az auditált alapállapotra épülnek rá.

## Naptárkimenetek

- `output/naptar/nevnapok.ics`
- `output/naptar/nevnapok-primary.ics`
- `output/naptar/nevnapok-rest.ics`

Ezek a fájlok továbbra is a projekt kimenetei, de **nem a pipeline írja őket**. A generálás és a letöltés az `/ics` munkatérről indul.

## Pipeline állapot

- `output/pipeline/manifest.yaml`

A manifest futási és frissességi nyilvántartás. Nem auditmagyarázat, hanem build-metaadat. A szakmai magyarázatot az auditriportok hordozzák.

## Mi látszik a GUI-ban?

A felület nem általános fájllistát ad, hanem:

- auditkártyákat és audit-inspectorokat,
- primer editor napi és név szerinti nézeteket,
- dashboard összegzéseket a blokkoló auditokról és a kézi döntést igénylő napokról,
- ICS havi előnézeteket, névszintű részletpanelek és letöltőgombokat,
- pipeline lépésinspectorokat.

A fájlok továbbra is mértékadóak, csak a kezelőfelület nem fájlböngészőként közelít hozzájuk.
