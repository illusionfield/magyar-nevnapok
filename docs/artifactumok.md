# Kimenetek és irányadó fájlok

A projekt elsődleges kimenetei továbbra is fájlalapúak.

A webes felület azonban nem ezek nyers böngészésére épül, hanem szemantikus editorokra:

- Auditok → kézi kivétellisták és részletes riport inspectorok
- Primer audit → közös primerdöntések és helyi overlay inline editor
- ICS generálás → teljes konfigurátor + előnézet + letöltés

## Fő kimenetek

### Kézi, irányadó források

- `data/primary-registry-overrides.yaml`
- `data/hivatalos-nevjegyzek-kivetelek.yaml`
- `.local/nevnapok.local.yaml`

### Generált primer- és auditállományok

- `output/primer/legacy-primer.yaml`
- `output/primer/wiki-primer.yaml`
- `output/primer/vegso-primer.yaml`
- `output/primer/normalizalo-riport.yaml`
- `output/riportok/*.yaml`

### Adatbázis és exportok

- `output/adatbazis/nevnapok.yaml`
- `output/adatbazis/nevnapok.csv`
- `output/adatbazis/nevnapok.xlsx`
- `output/adatbazis/formalizalt-elek.yaml`

### Naptárkimenetek

- `output/naptar/nevnapok.ics`
- `output/naptar/nevnapok-primary.ics`
- `output/naptar/nevnapok-rest.ics`

### Pipeline állapot

- `output/pipeline/manifest.yaml`

## Mi látszik a GUI-ban?

A felület ezeket nem általános fájllistaként mutatja, hanem:

- auditkártyák és audit-inspectorok,
- primer napi és név szerinti szerkesztőnézet,
- ICS előnézeti panelek és letöltőgombok,
- pipeline lépésinspectorok.

A fájlok továbbra is mértékadóak, csak a kezelőfelület nem fájlböngészőként közelít hozzájuk.
