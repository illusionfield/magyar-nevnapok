# Források és dokumentált kivételek

## Fő források

- HUN-REN / ELTE utónévportál
- Wikipédia napi oldalak
- legacy ICS névnapkészlet
- auditált primer registry

## Puppeteer és HUN-REN HTTP-kompatibilitás

A HUN-REN utónévportál jelenleg sima HTTP-n érhető el. A Puppeteer 24-es vonalával
érkező Chromium fej nélküli módja bizonyos oldalakat HTTPS-first logika miatt
`ERR_BLOCKED_BY_CLIENT` hibával blokkolhat.

A projekt ezért központi Puppeteer-indítási kompatibilitási kapcsolókat használ,
így a HUN-REN scraper továbbra is stabilan fut a frissített böngészőmotorral is.
Ez a workaround a `kozos/puppeteer-inditas.mjs` modulban van összefogva, hogy a
Wikipédia- és a HUN-REN-scraper ugyanazt a viselkedést kapja.

## Auditált primer registry

A végső primer és a napi auditált teljes névlista irányadó forrása:

```text
  data/audited-primary-registry.yaml
```

A fájl naponta tartalmazza a teljes auditált névlistát (`names`), a generátornak szánt végső primerlistát (`preferredNames`) és az auditálás időpontját (`auditedAt`). A pipeline-források újrafuttatása nem írja át ezt a fájlt; csak eltéréseket és javaslatokat mutat a primer audit felületen.

## Legacy primer-felülírások

A korábbi, közös primerfelülírási fájl továbbra is megmarad kompatibilitási és migrációs bemenetként:

```text
  data/primary-registry-overrides.yaml
```

Új végső primerdöntéshez nem ez az irányadó forrás.

## Hivatalos névjegyzék kivétellista

A dokumentált kivétellista helye:

```text
  data/hivatalos-nevjegyzek-kivetelek.yaml
```

A lista a következő dátumok közti eltéréseket dokumentálja:

- **2025. július 31.** — anyakönyvezhető névjegyzék
- **2025-08-12** — ELTE/HUN-REN adatbázisállapot

A kivételek célja nem a hiba elrejtése, hanem az explicit és visszakövethető eltéréskezelés.
