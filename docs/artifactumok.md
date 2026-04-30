# Kimenetek és irányadó fájlok

A projekt elsődleges kimenetei továbbra is fájlalapúak. A webes felület ezeket nem nyers fájlböngészőként mutatja, hanem szemantikus audit- és primer munkatereken keresztül teszi kezelhetővé.

## Mértékadó források

### Kézi, követett források

- `data/audited-primary-registry.yaml` — verziózott, kézzel auditált napi teljes névlista és végső primerlista
- `data/primary-registry-overrides.yaml` — legacy kompatibilitási és migrációs bemenet; nem aktív végső primerforrás
- `data/hivatalos-nevjegyzek-kivetelek.yaml` — dokumentált kivételek a hivatalos névjegyzék auditjához

### Helyi, nem követett profil

- `.local/nevnapok.local.yaml` — helyi ICS-beállítások és helyi primer overlay

A helyi profil nem helyettesíti az auditált registryt; csak személyes réteg a közös, auditált alap fölött. A saját primerlogika külön későbbi átalakítás tárgya.

## Primerlánc kimenetei

- `output/primer/legacy-primer.yaml`
- `output/primer/wiki-primer.yaml`
- `output/primer/vegso-primer.yaml`
- `output/primer/normalizalo-riport.yaml`

Ezek közül a legfontosabb a `vegso-primer.yaml`, mert sok felhasználónál ez már közvetlenül felhasználható primer adatbázis. Emiatt a minőségét külön auditok és golden regressziós tesztek is védik.

A `vegso-primer.yaml` a `data/audited-primary-registry.yaml` normalizált kimenete. A legacy, wiki, normalizált és rangsorolt primerforrások továbbra is lefutnak, de csak eltérésjelző és auditsegéd szerepük van; pipeline-futtatás nem írja át automatikusan az auditált registryt.

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

- `data/audited-primary-registry.yaml`
- `output/riportok/primer-audit.yaml`

Az auditált primer source of truth a `data/audited-primary-registry.yaml`.
Ebben naponta együtt él a teljes auditált névlista, a végső primerlista és az
utolsó jóváhagyási időbélyeg. A pipeline-források nem írják felül ezt a fájlt:
csak driftet, eltérést és javaslatot adnak az auditfelületnek.

A `primer-audit.yaml` **nem a külön auditok helyettesítője**. A szerepe:

- szerkesztői snapshot,
- az auditált primerdöntések és a forráseltérések egyben látható nézete,
- a webes primer editor adatforrása,
- a külön auditokból származó bizonyítékok leképezése.

Gyakorlati szabály:

- ha azt kell eldönteni, hogy **miért rossz vagy vitatott** a primer, a külön auditokat kell nézni,
- ha azt kell szerkeszteni, hogy **mi legyen az eredő primerállapot**, a
  Primer audit felület az auditált registryt menti, majd ebből készül a végső
  primerkimenet.

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
