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

- `output/riportok/primer-audit.yaml`

Ez az egységes primer audit havi bontásban együtt jeleníti meg

- a végső primernap neveit,
- a legacy / wiki / normalizált / rangsorolt forrásnézetet,
- a közös hiányzó neveket,
- valamint a személyes primerállapotot és a helyi kijelöléseket is.

### Helyi primerkiegészítések

```text
  .local/nevnapok.local.yaml
```

Ez a fájl nem követett, személyes bemenet.
Az itt tárolt `ics` blokk a közös naptárprofil mértékadó forrása.
Az `ics.outputMode` egyszerre pontosan egy aktív ICS-kimenetet jelöl ki.
A `personalPrimary` blokk a személyes primerforrást, a `Normalizált` / `Rangsor`
módosítókat és a kézi helyi primernapokat is együtt tárolja.
Az itt rögzített nevek nem írják felül a közös primerjegyzéket, hanem a személyes primeres
naptár generálásakor hozzáadódnak a közös primerlistához.

### Saját primeres naptár

```text
  output/naptar/nevnapok-sajat.ics
```

Ez a kimenet csak akkor készül el, ha az aktív `ics.outputMode` értéke `personal`.
A személyes primerforrás, a `Normalizált` / `Rangsor` módosítók és a kézi helyi
primernapok ekkor szólnak bele a generált tartalomba.
