# Pipeline és manifest

## Kanonikus lépések

1. `legacy-primer-epites`
2. `wiki-primer-gyujtes`
3. `vegso-primer-feloldas`
4. `portal-nevadatbazis-epites`
5. `formalizalt-elek-generalasa`
6. `naptar-generalas`
7. `audit-futtatas`

## Állapotparancs

```bash
  npm run cli -- pipeline allapot
```

A parancs minden lépéshez kiírja:

- a számított állapotot,
- az utolsó manifest-bejegyzés idejét,
- az utolsó manifest-státuszt.

## Manifest

Helye:

```text
  output/pipeline/manifest.yaml
```

Egy lépés manifest-bejegyzése tartalmazza:

- `stepId`
- `generatedAt`
- `status`
- `inputs`
- `outputs`
- `durationMs`
- `checksum`
- `sizeBytes`
- `error`
