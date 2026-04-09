# Források és dokumentált kivételek

## Fő források

- HUN-REN / ELTE utónévportál
- Wikipédia napi oldalak
- legacy ICS névnapkészlet
- kézi primer-felülírások

## Puppeteer és HUN-REN HTTP-kompatibilitás

A HUN-REN utónévportál jelenleg sima HTTP-n érhető el. A Puppeteer 24-es vonalával
érkező Chromium fej nélküli módja bizonyos oldalakat HTTPS-first logika miatt
`ERR_BLOCKED_BY_CLIENT` hibával blokkolhat.

A projekt ezért központi Puppeteer-indítási kompatibilitási kapcsolókat használ,
így a HUN-REN scraper továbbra is stabilan fut a frissített böngészőmotorral is.
Ez a workaround a `kozos/puppeteer-inditas.mjs` modulban van összefogva, hogy a
Wikipédia- és a HUN-REN-scraper ugyanazt a viselkedést kapja.

## Kézi primer-felülírások

A kézi primerdöntések elsődleges forrása:

```text
  data/primary-registry-overrides.yaml
```

## Hivatalos névjegyzék kivétellista

A dokumentált kivétellista helye:

```text
  data/hivatalos-nevjegyzek-kivetelek.yaml
```

A lista a következő dátumok közti eltéréseket dokumentálja:

- **2025. július 31.** — anyakönyvezhető névjegyzék
- **2025-08-12** — ELTE/HUN-REN adatbázisállapot

A kivételek célja nem a hiba elrejtése, hanem az explicit és visszakövethető eltéréskezelés.
