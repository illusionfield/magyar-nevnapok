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
- a helyben feloldott és a helyben még nyitott hiányzókat,
- valamint a helyi primerállapotot és a helyi overlayt is.

### Helyi primerkiegészítések

```text
  .local/nevnapok.local.yaml
```

Ez a fájl nem követett, helyi bemenet.
Az itt tárolt `ics` blokk a közös naptárprofil mértékadó forrása.
A közös, követett primerfelülírások mértékadó fájlja külön a
`data/primary-registry-overrides.yaml`.
Az `ics.partitionMode` egyszerűen azt jelzi, hogy egyetlen naptár készüljön
(`single`), vagy külön elsődleges és külön további naptár (`split`).
A `personalPrimary` blokk a helyi primerforrást, a `Normalizált` / `Rangsor`
módosítókat és a kézi helyi primernapokat együtt tárolja.
Az itt rögzített adatok nem írják felül a közös primerjegyzéket, hanem helyi overlayként
hozzáadódnak a közös primerlistához.

### ICS kimenetek

```text
  output/naptar/nevnapok.ics
  output/naptar/nevnapok-primary.ics
  output/naptar/nevnapok-rest.ics
```

Az egyfájlos `nevnapok.ics` a `single` mód alapértelmezett kimenete, és mindig
minden névnapot tartalmaz.

A bontott `nevnapok-primary.ics` és `nevnapok-rest.ics` a `split` mód alapértelmezett
kimenetei. Ilyenkor:

- a Primer audit automatikusan frissül,
- a helyi primerforrás és a `Normalizált` / `Rangsor` módosítók ott véglegesülnek,
- az ICS-generálás pedig már csak a kész audit snapshot alapján választja szét az
  elsődleges és a további neveket.
