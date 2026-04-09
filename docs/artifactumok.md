# Artifactum-specifikációk

## Alapelvek

Minden kanonikus artifact:

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

### Formalizált élek

```text
  output/adatbazis/formalizalt-elek.yaml
```

### Riportok

```text
  output/riportok/*.yaml
```
