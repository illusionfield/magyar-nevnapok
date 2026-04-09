# Artifactum-specifikációk

## Alapelvek

Minden elsődleges artifact:

- verziózott,
- YAML-ban íródik,
- JS-validátoron megy át,
- dokumentált alapútvonallal rendelkezik.

## Fő artifactok

### Legacy primer

```text
  output/primer/legacy-primer.yaml
```

Tartalom:

- `version`
- `generatedAt`
- `sourceFile`
- `stats`
- `days`

### Wiki primer

```text
  output/primer/wiki-primer.yaml
```

### Végső primer

```text
  output/primer/vegso-primer.yaml
```

### Névadatbázis

```text
  output/adatbazis/nevnapok.yaml
```

### Táblázatos exportok

```text
  output/adatbazis/nevnapok.csv
  output/adatbazis/nevnapok.xlsx
```

- A `csv` export egyetlen, lapos névnap-hozzárendelési táblát ad.
- Az `xlsx` export ugyanezt kibővíti napi összegző és meta munkalappal.

### Formalizált élek

```text
  output/adatbazis/formalizalt-elek.yaml
```

### Riportok

```text
  output/riportok/*.yaml
```

Különösen fontos riportok:

- `output/riportok/vegso-primer-riport.yaml`
- `output/riportok/primer-nelkul-marado-nevek-riport.yaml`

Az utóbbi riport havi bontásban jeleníti meg

- a végső primernap neveit,
- a normalizált hiányokat,
- a rangsorolt hiányokat,
- valamint a kettő unióját is külön közös oszlopban.

### Helyi primerkiegészítések

```text
  data/primary-registry-overrides.local.yaml
```

Ez a fájl nem követett, személyes bemenet.
Az itt rögzített nevek nem írják felül a közös primerjegyzéket, hanem a személyes primeres
naptár generálásakor hozzáadódnak a közös primerlistához.

### Saját primeres naptár

```text
  output/naptar/nevnapok-sajat.ics
```

Ez a kimenet csak akkor készül el, ha a helyi primerkiegészítések között legalább egy név szerepel.
