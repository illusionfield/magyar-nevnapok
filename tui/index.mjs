/**
 * tui/index.mjs
 * Ink-alapú interaktív terminálfelület a pipeline-hoz, auditokhoz és a helyi primer-szerkesztőhöz.
 */

import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  allitSajatPrimerForrast,
  betoltAuditInspectorAdata,
  betoltPrimerNelkulMaradoNevekSzerkesztoAdata,
  kapcsolPrimerNelkuliHelyiKiegeszitest,
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  pipelineAllapot,
} from "../index.mjs";

const e = React.createElement;
const KOZOS_FORRAS_CIMKEK = {
  normalized: "N",
  ranking: "R",
};
const SAJAT_PRIMER_FORRAS_PROFILOK = ["default", "legacy", "ranked", "either"];
const ALAPERTELMEZETT_ICS_BEALLITASOK = {
  splitPrimaryRest: false,
  mode: "together",
  primaryCalendarMode: "together",
  restCalendarMode: "together",
  leapMode: "none",
  leapStrategy: "b",
  fromYear: new Date().getFullYear(),
  untilYear: 2040,
  baseYear: 2024,
  descriptionMode: "none",
  descriptionFormat: "text",
  ordinalDay: "none",
  includeOtherDays: false,
};
const ICS_BEALLITAS_DEFINICIOK = [
  {
    kulcs: "splitPrimaryRest",
    cimke: "Primer / további szétválasztás",
    tipus: "boolean",
    rovidLeiras:
      "Külön fájlba bontja az elsődleges és a további névnapokat. Hasznos, ha két külön naptárt szeretnél szinkronizálni.",
    ertekLeirasok: {
      true:
        "Két külön ICS készül: egy elsődleges és egy további névnapos. A szétválasztott naptárak külön-külön is importálhatók.",
      false:
        "Minden névnap egyetlen kimeneti naptárba kerül. Ez a legegyszerűbb, egyfájlos használat.",
    },
  },
  {
    kulcs: "mode",
    cimke: "Naptármód",
    tipus: "enum",
    ertekek: [
      "together",
      "separate",
      "primary-together",
      "primary-together-with-rest",
      "primary-separate",
      "primary-separate-with-rest",
    ],
    rovidLeiras:
      "Meghatározza, hogy naponta egy esemény készüljön, vagy névenként külön események, illetve hogy csak primernevek vagy minden névnap jelenjen meg.",
    ertekLeirasok: {
      together:
        "Naponta egyetlen esemény készül, amelyen az aznapi nevek együtt jelennek meg. Ez a legletisztultabb általános naptárnézet.",
      separate:
        "Minden név külön eseményt kap. Akkor hasznos, ha szűrni vagy finomabban feldolgozni akarod az eseményeket.",
      "primary-together":
        "Csak az elsődleges nevek kerülnek be, naponta egy eseményben összefogva. Jó választás tiszta primernaptárhoz.",
      "primary-together-with-rest":
        "Az elsődleges nevek a fő eseményben maradnak, a további nevek pedig a leírásban szerepelnek. Kiegyensúlyozott, informatív mód.",
      "primary-separate":
        "Csak az elsődleges nevek maradnak bent, és azok is külön eseményenként. Részletes, de még mindig primerfókuszú nézet.",
      "primary-separate-with-rest":
        "Az elsődleges nevek külön eseményeket kapnak, a további névnapok pedig kiegészítő információként megmaradnak. Haladó, részletes beállítás.",
    },
  },
  {
    kulcs: "primaryCalendarMode",
    cimke: "Elsődleges naptár módja",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    rovidLeiras:
      "Szétválasztott exportnál ez dönti el, hogy az elsődleges naptár naponta egyetlen eseményt vagy névenként külön eseményeket kapjon.",
    ertekLeirasok: {
      grouped: "Az elsődleges nevek naponta együtt maradnak, így rövidebb és nyugodtabb naptárképet adnak.",
      separate:
        "Az elsődleges nevek külön események lesznek. Akkor jó, ha névenként akarsz szűrni vagy külön emlékeztetőket kezelni.",
    },
  },
  {
    kulcs: "restCalendarMode",
    cimke: "További naptár módja",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    rovidLeiras:
      "Szétválasztott exportnál ez szabályozza a nem elsődleges névnapok csoportosítását.",
    ertekLeirasok: {
      grouped:
        "A további névnapok naponta csoportosítva jelennek meg. Ez a kevésbé zajos, áttekinthetőbb beállítás.",
      separate:
        "A további névnapok külön eseményekké válnak. Akkor hasznos, ha a teljes névnapkészletet részletesen akarod látni.",
    },
  },
  {
    kulcs: "leapMode",
    cimke: "Szökőéves mód",
    tipus: "enum",
    ertekek: ["none", "hungarian-until-2050"],
    rovidLeiras:
      "A február végi mozgó névnapok kezelését szabályozza. A magyar gyakorlat 2050-ig külön stratégiával modellezhető.",
    ertekLeirasok: {
      none:
        "Nincs külön szökőéves eltolás. Az események egyszerű, ismétlődő mintában készülnek el.",
      "hungarian-until-2050":
        "A magyar február 24–29. napokra vonatkozó eltolási szabályt alkalmazza 2050-ig. Ez a történeti és gyakorlati kompatibilitási mód.",
    },
  },
  {
    kulcs: "leapStrategy",
    cimke: "Szökőéves stratégia",
    tipus: "enum",
    ertekek: ["a", "b", "both"],
    rovidLeiras:
      "A magyar szökőéves névnapeltolás több értelmezési változata közül választ. Csak akkor számít, ha a szökőéves mód be van kapcsolva.",
    ertekLeirasok: {
      a: "Az A stratégia szerint generál. Ezt használd, ha a korábbi kompatibilitási variánsod erre épült.",
      b: "A B stratégia szerint generál. Akkor célszerű, ha a másik történeti eltolási mintát követed.",
      both:
        "Mindkét változat külön fájlban elkészül. Összehasonlításhoz és ellenőrzéshez a leghasznosabb opció.",
    },
  },
  {
    kulcs: "fromYear",
    cimke: "Szökőéves tartomány kezdete",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
    rovidLeiras:
      "A szökőéves, konkrét évre szóló események kezdőéve. Csak a magyar szökőéves mód mellett lényeges.",
  },
  {
    kulcs: "untilYear",
    cimke: "Szökőéves tartomány vége",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
    rovidLeiras:
      "A szökőéves, konkrét évre szóló események utolsó éve. Ha növeled, hosszabb időhorizontra készülnek el az eltolt februári napok.",
  },
  {
    kulcs: "baseYear",
    cimke: "Bázisév",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
    rovidLeiras:
      "A nem szökőéves ismétlődő események technikai báziséve. Naptárimport-kompatibilitási célra szolgál, ritkán kell módosítani.",
  },
  {
    kulcs: "descriptionMode",
    cimke: "Leírásmód",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
    rovidLeiras:
      "Megadja, mennyi kiegészítő szöveg kerüljön az eseményleírásba.",
    ertekLeirasok: {
      none: "Nem kerül külön leírás az eseményekbe. A legminimalistább naptárkimenet.",
      compact:
        "Rövid, tömör leírás készül a legfontosabb adatokkal. Áttekinthető marad, de ad kontextust.",
      detailed:
        "Részletes eseményleírás készül. Akkor hasznos, ha a naptár legyen önmagában is informatív referencia.",
    },
  },
  {
    kulcs: "descriptionFormat",
    cimke: "Leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
    rovidLeiras:
      "A leírás technikai formátumát szabályozza, hogy a cél naptáralkalmazás milyen gazdag tartalmat tud megjeleníteni.",
    ertekLeirasok: {
      text: "Csak egyszerű szöveges leírás készül. Ez a legszélesebb körben kompatibilis forma.",
      html: "HTML-leírás készül, gazdagabb megjelenítéshez. Olyan klienseknél hasznos, amelyek ezt ténylegesen kirajzolják.",
      full:
        "A szöveges és a gazdagabb leírás együtt készül el. Akkor jó, ha vegyes klienskörnyezetre exportálsz.",
    },
  },
  {
    kulcs: "ordinalDay",
    cimke: "Év napja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
    rovidLeiras:
      "Az év sorszámozott napjának megjelenítését szabályozza. Ez inkább információs extra, mint kötelező névnapadat.",
    ertekLeirasok: {
      none: "Az év napja egyáltalán nem jelenik meg.",
      summary: "Az év napja rövid, kiemelt formában kerül be az esemény összefoglaló részébe.",
      description: "Az év napja a leírás részeként jelenik meg, így kevésbé hangsúlyos, de visszakereshető.",
    },
  },
  {
    kulcs: "includeOtherDays",
    cimke: "További névnapok a leírásban",
    tipus: "boolean",
    rovidLeiras:
      "Az elsődleges fókuszú események leírásába beemeli a nem elsődleges, ugyanarra a napra eső neveket is.",
    ertekLeirasok: {
      true:
        "A leírásban megjelennek a további névnapok is. Ettől informatívabb lesz a naptár, de hosszabb leírásokat kapsz.",
      false:
        "Csak a kiválasztott eseménylogika szerinti fő nevek látszanak. Rövidebb és tisztább marad a kimenet.",
    },
  },
];

const menuPontok = [
  {
    azonosito: "allapot",
    cim: "Pipeline áttekintő",
    leiras: "Megmutatja a teljes pipeline aktuális állapotát.",
    vegrehajt: async () => ({ tipus: "allapot", adat: await pipelineAllapot() }),
  },
  {
    azonosito: "teljes",
    cim: "Teljes pipeline futtatása",
    leiras: "Legacy primer → wiki → végső primer → adatbázis → élek → auditok.",
    vegrehajt: async () => ({ tipus: "futas", adat: await futtatPipeline("teljes") }),
  },
  {
    azonosito: "ics",
    cim: "ICS generálás",
    leiras: "Megnyitja az ICS-beállításokat, majd a kiválasztott kapcsolókkal generál naptárt.",
    vegrehajt: async () => ({
      tipus: "ics-beallitasok",
      adat: { ...ALAPERTELMEZETT_ICS_BEALLITASOK },
    }),
  },
  {
    azonosito: "audit",
    cim: "Összes audit futtatása",
    leiras: "Hivatalos lista, primer-összevetések, végső riport és primer nélküli audit.",
    vegrehajt: async () => ({ tipus: "audit", adat: await futtatAuditot("mind") }),
  },
  {
    azonosito: "audit-vegso-primer-inspector",
    cim: "Végső primer audit inspector",
    leiras: "Böngészhető, napi nézet a végső primerjegyzék forrásairól, eltéréseiről és rejtett neveiről.",
    vegrehajt: async () => ({
      tipus: "audit-inspector",
      adat: await betoltAuditInspectorAdata("vegso-primer"),
    }),
  },
  {
    azonosito: "audit-primer-nelkul-inspector",
    cim: "Primer nélkül maradó nevek inspector",
    leiras: "Havi bontásban böngészhető, színezett nézet a végső primerkészletből kimaradó nevekre.",
    vegrehajt: async () => ({
      tipus: "audit-inspector",
      adat: await betoltAuditInspectorAdata("primer-nelkul-marado-nevek"),
    }),
  },
  {
    azonosito: "primer-szerkeszto",
    cim: "Saját primer szerkesztő",
    leiras: "A közös hiányzó oszlopból space-szel helyi primerkiegészítést lehet kapcsolni.",
    vegrehajt: async () => ({
      tipus: "primer-szerkeszto",
      adat: await betoltPrimerNelkulMaradoNevekSzerkesztoAdata(),
    }),
  },
  {
    azonosito: "kilepes",
    cim: "Kilépés",
    leiras: "Bezárja az interaktív felületet.",
    vegrehajt: async () => ({ tipus: "kilepes" }),
  },
];

/**
 * Az `allapotSzoveg` rövid, emojival jelölt állapotszöveget készít a TUI számára.
 */
function allapotSzoveg(status) {
  switch (status) {
    case "kesz":
      return "✅ kész";
    case "elavult":
      return "⚠️ elavult";
    case "hianyzik":
      return "❌ hiányzik";
    case "blokkolt":
      return "⛔ blokkolt";
    default:
      return `ℹ️ ${status}`;
  }
}

/**
 * A `keresMenuPontIndexet` megadja a menüpont indexét az azonosítója alapján.
 */
function keresMenuPontIndexet(azonosito) {
  const index = menuPontok.findIndex((pont) => pont.azonosito === azonosito);
  return index >= 0 ? index : 0;
}

/**
 * A `relativUtvonal` a TUI-ban rövidebb, olvashatóbb útvonalakat jelenít meg.
 */
function relativUtvonal(utvonal) {
  if (!utvonal) {
    return "—";
  }

  return path.relative(process.cwd(), utvonal) || path.basename(utvonal);
}

/**
 * A `formatForrasJelzo` rövid forrásjelölést ad a közös oszlop tételeihez.
 */
function formatForrasJelzo(sources) {
  const cimkek = (Array.isArray(sources) ? sources : [])
    .map((source) => KOZOS_FORRAS_CIMKEK[source])
    .filter(Boolean);

  if (cimkek.length === 0) {
    return "[?]";
  }

  return `[${cimkek.join("+")}]`;
}

/**
 * A `formataltNevek` rövid névlistát készít.
 */
function formataltNevek(values, maxItems = 4) {
  const normalized = (Array.isArray(values) ? values : []).filter(Boolean);

  if (normalized.length === 0) {
    return "—";
  }

  const visible = normalized.slice(0, maxItems).join(" • ");
  const suffix = normalized.length > maxItems ? ` … (+${normalized.length - maxItems})` : "";
  return `${visible}${suffix}`;
}

/**
 * A `lapitottSzerkesztoSorok` egyetlen navigálható listává bontja a havi szerkesztőadatot.
 */
function lapitottSzerkesztoSorok(months) {
  return (Array.isArray(months) ? months : []).flatMap((month) =>
    (month.rows ?? []).map((row) => ({
      ...row,
      monthName: month.monthName,
    }))
  );
}

/**
 * A `kijeloltAblak` csak a kijelölt sor környezetét adja vissza, hogy a bal oldali lista ne legyen túl hosszú.
 */
function kijeloltAblak(values, activeIndex, windowSize = 12) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const size = Math.max(1, windowSize);
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(values.length - size, activeIndex - half));

  return values.slice(start, start + size).map((value, offset) => ({
    ...value,
    globalIndex: start + offset,
  }));
}

/**
 * A `szamolHelyiKijeloleseket` összesíti a jelenleg bejelölt helyi neveket.
 */
function szamolHelyiKijeloleseket(months) {
  return lapitottSzerkesztoSorok(months).reduce(
    (sum, row) =>
      sum + (row.combinedMissing ?? []).filter((entry) => entry.localSelected === true).length,
    0
  );
}

/**
 * A `lapitottAuditSorok` az audit-inspector havi sorait egyetlen navigálható listává alakítja.
 */
function lapitottAuditSorok(months) {
  return (Array.isArray(months) ? months : []).flatMap((month) =>
    (month.rows ?? []).map((row) => ({
      ...row,
      monthName: month.monthName,
    }))
  );
}

/**
 * A `vegsoPrimerForrasCimke` rövid, olvasható címkét ad a végső primer napi forrásához.
 */
function vegsoPrimerForrasCimke(value) {
  const cimkek = {
    "manual-override": "kézi felülírás",
    "legacy-wiki-exact": "legacy = wiki",
    "warning-union": "figyelmeztetéses unió",
  };

  return cimkek[value] ?? (value || "ismeretlen");
}

/**
 * A `vegsoPrimerForrasSzine` színt rendel a végső primer napi forrásához.
 */
function vegsoPrimerForrasSzine(row) {
  if (row?.warning) {
    return "red";
  }

  if (row?.source === "manual-override") {
    return "yellow";
  }

  if (row?.source === "legacy-wiki-exact") {
    return "green";
  }

  return "cyan";
}

/**
 * A `primerNapSzine` a végső primerdarab alapján színt választ.
 */
function primerNapSzine(finalPrimaryCount) {
  if (finalPrimaryCount === 1) {
    return "green";
  }

  if (finalPrimaryCount === 2) {
    return "yellow";
  }

  if (finalPrimaryCount >= 3) {
    return "red";
  }

  return undefined;
}

/**
 * A `formataltKapcsolodoPrimerek` rövid, olvasható hasonlóprimer-listát készít.
 */
function formataltKapcsolodoPrimerek(entries, maxItems = 6) {
  const normalized = (Array.isArray(entries) ? entries : []).map(
    (entry) => `${entry.primaryName} (${entry.relation})`
  );

  return formataltNevek(normalized, maxItems);
}

/**
 * A `frissitHelyiKijelolest` immutábilisan frissíti egy név helyi jelölési állapotát.
 */
function frissitHelyiKijelolest(adat, monthDay, name, selected) {
  const nextMonths = (adat.months ?? []).map((month) => ({
    ...month,
    rows: (month.rows ?? []).map((row) => {
      if (row.monthDay !== monthDay) {
        return row;
      }

      return {
        ...row,
        combinedMissing: (row.combinedMissing ?? []).map((entry) =>
          entry.name === name
            ? {
                ...entry,
                localSelected: selected,
              }
            : entry
        ),
      };
    }),
  }));

  return {
    ...adat,
    months: nextMonths,
    summary: {
      ...(adat.summary ?? {}),
      localSelectedCount: szamolHelyiKijeloleseket(nextMonths),
    },
  };
}

/**
 * A `MenuNezet` kirajzolja a TUI menüjét és a kijelölt pontot.
 */
function MenuNezet({ kijelolt }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "magyar-nevnapok TUI"),
    e(Text, null, "Nyilak: választás • Enter: indítás • q: kilépés"),
    e(
      Box,
      { marginTop: 1, flexDirection: "column" },
      ...menuPontok.map((pont, index) =>
        e(
          Box,
          { key: pont.azonosito, flexDirection: "column", marginBottom: 1 },
          e(
            Text,
            { color: index === kijelolt ? "cyan" : undefined },
            `${index === kijelolt ? "❯ " : "  "}${pont.cim}`
          ),
          e(Text, { dimColor: true }, pont.leiras)
        )
      )
    )
  );
}

/**
 * A `BetoltesNezet` a futó művelethez tartozó várakozási nézetet jeleníti meg.
 */
function BetoltesNezet({ aktivPont }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Futtatás folyamatban"),
    e(Box, { marginTop: 1 }, e(Spinner, { label: `${aktivPont.cim}...` }))
  );
}

/**
 * A `HibaNezet` a felületen megjeleníthető hibaösszegzést adja vissza.
 */
function HibaNezet({ hiba }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: "red", bold: true }, "Hiba történt"),
    e(Text, null, hiba?.message ?? String(hiba)),
    e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés")
  );
}

/**
 * Az `AllapotNezet` a pipeline állapotát jeleníti meg a TUI-ban.
 */
function AllapotNezet({ sorok }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Pipeline áttekintő"),
    e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés"),
    e(
      Box,
      { marginTop: 1, flexDirection: "column" },
      ...sorok.map((sor) =>
        e(
          Text,
          { key: sor.azonosito },
          `${allapotSzoveg(sor.status)} ${sor.azonosito}${sor.utolsoFutas ? ` • utolsó futás: ${sor.utolsoFutas}` : ""}`
        )
      )
    )
  );
}

/**
 * Az `EredmenyNezet` az utolsó művelet eredményét jeleníti meg.
 */
function EredmenyNezet({ aktivPont, eredmeny }) {
  const sorok = formataltEredmenySorok(eredmeny);

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Sikeres művelet"),
    e(Text, null, aktivPont.cim),
    e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés"),
    e(
      Box,
      { marginTop: 1, flexDirection: "column" },
      ...sorok.map((sor, index) => e(Text, { key: `${aktivPont.azonosito}-${index}` }, sor))
    )
  );
}

/**
 * Az `icsErtekCimke` emberi olvasatra alkalmas címkét ad az ICS-beállítások aktuális értékeihez.
 */
function icsErtekCimke(kulcs, ertek) {
  const cimkek = {
    splitPrimaryRest: ertek ? "igen" : "nem",
    includeOtherDays: ertek ? "igen" : "nem",
    mode: {
      together: "egy esemény naponta",
      separate: "külön esemény névenként",
      "primary-together": "csak primerek, naponta együtt",
      "primary-together-with-rest": "primerek együtt, többi a leírásban",
      "primary-separate": "csak primerek, külön eseményenként",
      "primary-separate-with-rest": "primerek külön, többi külön gyűjtve",
    },
    primaryCalendarMode: {
      grouped: "egyben",
      together: "egyben",
      separate: "külön",
    },
    restCalendarMode: {
      grouped: "egyben",
      together: "egyben",
      separate: "külön",
    },
    leapMode: {
      none: "kikapcsolva",
      "hungarian-until-2050": "magyar szabály 2050-ig",
    },
    leapStrategy: {
      a: "A",
      b: "B",
      both: "A + B",
    },
    descriptionMode: {
      none: "nincs",
      compact: "tömör",
      detailed: "részletes",
    },
    descriptionFormat: {
      text: "szöveg",
      html: "HTML",
      full: "szöveg + HTML",
    },
    ordinalDay: {
      none: "nincs",
      summary: "címben",
      description: "leírásban",
    },
  };

  if (typeof ertek === "boolean") {
    return ertek ? "igen" : "nem";
  }

  if (typeof ertek === "number") {
    return String(ertek);
  }

  const tabla = cimkek[kulcs];

  if (tabla && typeof tabla === "object") {
    return tabla[ertek] ?? String(ertek);
  }

  return String(ertek);
}

/**
 * Az `icsBeallitasLeiras` részletes magyarázatot ad az aktuálisan kijelölt ICS-kapcsolóhoz.
 */
function icsBeallitasLeiras(definicio, beallitasok) {
  if (!definicio) {
    return [];
  }

  const aktualisErtek = beallitasok[definicio.kulcs];
  const ertekKulcs = String(aktualisErtek);
  const aktualisLeiras =
    definicio.ertekLeirasok?.[aktualisErtek] ??
    definicio.ertekLeirasok?.[ertekKulcs] ??
    null;
  const sorok = [
    `Mit vezérel: ${definicio.rovidLeiras ?? "—"}`,
    `Aktuális érték: ${icsErtekCimke(definicio.kulcs, aktualisErtek)}`,
  ];

  if (aktualisLeiras) {
    sorok.push(`Mit csinál most: ${aktualisLeiras}`);
  }

  if (definicio.tipus === "number") {
    sorok.push(
      `Értéktartomány: ${definicio.min ?? "—"} – ${definicio.max ?? "—"}${
        definicio.step ? `, lépésköz: ${definicio.step}` : ""
      }`
    );
  }

  return sorok;
}

/**
 * A `icsBeallitasValtozasUzenet` rövid infósáv-szöveget készít egy állítás után.
 */
function icsBeallitasValtozasUzenet(definicio, beallitasok) {
  const sorok = icsBeallitasLeiras(definicio, beallitasok);

  if (sorok.length === 0) {
    return null;
  }

  return `${definicio.cimke} → ${icsErtekCimke(
    definicio.kulcs,
    beallitasok[definicio.kulcs]
  )}. ${sorok.slice(2).join(" ")}`.trim();
}

/**
 * A `sajatPrimerForrasCimke` emberi olvasatú címkét ad a személyes primerforrás-profilhoz.
 */
function sajatPrimerForrasCimke(ertek) {
  const cimkek = {
    default: "alapértelmezett (legacy + ranking kiegészítés)",
    legacy: "legacy elsődlegesek",
    ranked: "rangsorolt elsődlegesek",
    either: "legacy vagy ranking uniója",
  };

  return cimkek[ertek] ?? String(ertek);
}

/**
 * A `sajatPrimerForrasLeiras` részletes magyarázatot ad a személyes primerforrás-profilhoz.
 */
function sajatPrimerForrasLeiras(ertek) {
  const leirasok = {
    default:
      "A saját naptárban az alapértelmezett primerlogika marad érvényben: a legacy elsődlegesek és a rangsorolt kiegészítések együtt határozzák meg a primerneveket.",
    legacy:
      "A saját naptár primeres része csak a legacy elsődleges kijelölésre támaszkodik. Akkor hasznos, ha a régi, hagyományos névnaprendhez akarsz közelebb maradni.",
    ranked:
      "A saját naptár primeres része a rangsorolt névjelölésekre épül. Ez modernebb, gyakorisági alapú fókuszt adhat a naptárnak.",
    either:
      "A saját naptárban a legacy és a rangsorolt primerjelölés uniója használható. Ez bővebb primerlistát eredményezhet, de zajosabb is lehet.",
  };

  return leirasok[ertek] ?? String(ertek);
}

/**
 * Az `leptetEnumErteket` a definiált enumkészleten belül mozgatja a kijelölt opciót.
 */
function leptetEnumErteket(ertekek, aktualisErtek, irany) {
  const lista = Array.isArray(ertekek) ? ertekek : [];

  if (lista.length === 0) {
    return aktualisErtek;
  }

  const aktualisIndex = Math.max(0, lista.indexOf(aktualisErtek));
  const kovetkezoIndex = (aktualisIndex + irany + lista.length) % lista.length;
  return lista[kovetkezoIndex];
}

/**
 * Az `frissitIcsBeallitast` egyetlen beállítást módosít a definíció alapján.
 */
function frissitIcsBeallitast(beallitasok, definicio, irany) {
  const aktualisErtek = beallitasok[definicio.kulcs];

  if (definicio.tipus === "boolean") {
    return {
      ...beallitasok,
      [definicio.kulcs]: !aktualisErtek,
    };
  }

  if (definicio.tipus === "enum") {
    return {
      ...beallitasok,
      [definicio.kulcs]: leptetEnumErteket(definicio.ertekek, aktualisErtek, irany),
    };
  }

  if (definicio.tipus === "number") {
    const step = definicio.step ?? 1;
    const min = definicio.min ?? Number.MIN_SAFE_INTEGER;
    const max = definicio.max ?? Number.MAX_SAFE_INTEGER;
    const kovetkezo = Math.max(min, Math.min(max, Number(aktualisErtek) + irany * step));

    return {
      ...beallitasok,
      [definicio.kulcs]: kovetkezo,
    };
  }

  return beallitasok;
}

/**
 * A `buildIcsParancsElozetet` rövid parancselőnézetet ad a TUI ICS-beállításaihoz.
 */
function buildIcsParancsElozetet(beallitasok) {
  const reszek = ["nevnapok kimenet general ics"];

  if (beallitasok.splitPrimaryRest) {
    reszek.push("--split-primary-rest");
  }

  reszek.push(`--mode ${beallitasok.mode}`);
  reszek.push(`--primary-calendar-mode ${beallitasok.primaryCalendarMode}`);
  reszek.push(`--rest-calendar-mode ${beallitasok.restCalendarMode}`);
  reszek.push(`--leap-mode ${beallitasok.leapMode}`);
  reszek.push(`--leap-strategy ${beallitasok.leapStrategy}`);
  reszek.push(`--from-year ${beallitasok.fromYear}`);
  reszek.push(`--until-year ${beallitasok.untilYear}`);
  reszek.push(`--base-year ${beallitasok.baseYear}`);
  reszek.push(`--description ${beallitasok.descriptionMode}`);
  reszek.push(`--description-format ${beallitasok.descriptionFormat}`);
  reszek.push(`--ordinal-day ${beallitasok.ordinalDay}`);

  if (beallitasok.includeOtherDays) {
    reszek.push("--include-other-days");
  }

  return reszek.join(" ");
}

/**
 * Az `ICSBeallitasNezet` a régi kapcsolókat TUI-ból is vezérelhetővé teszi.
 */
function ICSBeallitasNezet({ adat, visszaMenu }) {
  const { exit } = useApp();
  const [beallitasok, setBeallitasok] = useState(adat);
  const [kijeloltIndex, setKijeloltIndex] = useState(0);
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setBeallitasok(adat);
    setKijeloltIndex(0);
    setUzenet(icsBeallitasValtozasUzenet(ICS_BEALLITAS_DEFINICIOK[0], adat));
    setUzenetTipus("info");
  }, [adat]);

  const aktualisDefinicio = ICS_BEALLITAS_DEFINICIOK[kijeloltIndex] ?? null;
  const helpSorok = icsBeallitasLeiras(aktualisDefinicio, beallitasok);

  useInput(async (input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (folyamatban) {
      return;
    }

    if (key.escape || input === "v") {
      visszaMenu();
      return;
    }

    if (key.upArrow) {
      setKijeloltIndex((elozo) => {
        const kovetkezo =
          (elozo - 1 + ICS_BEALLITAS_DEFINICIOK.length) % ICS_BEALLITAS_DEFINICIOK.length;
        setUzenet(icsBeallitasValtozasUzenet(ICS_BEALLITAS_DEFINICIOK[kovetkezo], beallitasok));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (key.downArrow) {
      setKijeloltIndex((elozo) => {
        const kovetkezo = (elozo + 1) % ICS_BEALLITAS_DEFINICIOK.length;
        setUzenet(icsBeallitasValtozasUzenet(ICS_BEALLITAS_DEFINICIOK[kovetkezo], beallitasok));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (key.leftArrow) {
      setBeallitasok((elozo) => {
        const kovetkezo = frissitIcsBeallitast(elozo, aktualisDefinicio, -1);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, kovetkezo));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (key.rightArrow) {
      setBeallitasok((elozo) => {
        const kovetkezo = frissitIcsBeallitast(elozo, aktualisDefinicio, 1);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, kovetkezo));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (input === " ") {
      setBeallitasok((elozo) => {
        const kovetkezo = frissitIcsBeallitast(elozo, aktualisDefinicio, 1);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, kovetkezo));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (input === "r") {
      setBeallitasok({ ...ALAPERTELMEZETT_ICS_BEALLITASOK });
      setUzenetTipus("info");
      setUzenet(
        "Az ICS-beállítások visszaálltak az alapértékekre. A személyes primerforrás a Saját primer szerkesztőben állítható."
      );
      return;
    }

    if (key.return) {
      setFolyamatban(true);

      try {
        const utvonalak = await generalKimenetet("ics", beallitasok);
        setUzenetTipus("siker");
        setUzenet(
          `ICS generálás kész: ${utvonalak.map((utvonal) => relativUtvonal(utvonal)).join(", ")}`
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
    }
  });

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "ICS generálás – beállítások"),
    e(
      Text,
      { dimColor: true },
      "↑/↓: sor • ←/→ vagy Space: értékváltás • Enter: generálás • r: alaphelyzet • Esc vagy v: vissza • q: kilépés"
    ),
    e(
      Text,
      { dimColor: true },
      "A teljes opciólista a CLI-ben is elérhető: nevnapok kimenet general ics --help"
    ),
    folyamatban
      ? e(Box, { marginTop: 1 }, e(Spinner, { label: "ICS generálás folyamatban..." }))
      : null,
    uzenet
      ? e(
          Text,
          {
            color:
              uzenetTipus === "hiba"
                ? "red"
                : uzenetTipus === "siker"
                  ? "green"
                  : "cyan",
          },
          uzenet
        )
      : null,
    e(
      Box,
      { marginTop: 1 },
      e(
        Box,
        { flexDirection: "column", width: 58, marginRight: 2 },
        e(Text, { bold: true }, "Kapcsolók"),
        ...ICS_BEALLITAS_DEFINICIOK.map((definicio, index) =>
          e(
            Text,
            {
              key: definicio.kulcs,
              color: index === kijeloltIndex ? "cyan" : undefined,
            },
            `${index === kijeloltIndex ? "❯" : " "} ${definicio.cimke}: ${icsErtekCimke(
              definicio.kulcs,
              beallitasok[definicio.kulcs]
            )}`
          )
        )
      ),
      e(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        e(Text, { bold: true }, "Parancselőnézet"),
        e(Text, null, buildIcsParancsElozetet(beallitasok)),
        e(Text, { bold: true }, ""),
        e(Text, { bold: true }, "Kapcsoló részletes leírása"),
        ...(helpSorok.length > 0
          ? helpSorok.map((sor, index) => e(Text, { key: `ics-help-${index}` }, sor))
          : [e(Text, { key: "ics-help-ures", dimColor: true }, "Nincs kijelölt kapcsoló.")]),
        e(Text, { bold: true }, ""),
        e(Text, { bold: true }, "Megjegyzés"),
        e(
          Text,
          null,
          "A primerforrás választó innen kikerült. A saját naptár primerlogikáját a Saját primer szerkesztő kezeli, mert ott együtt látszik a helyi kijelölésekkel és az egyéni naptárgenerálással."
        )
      )
    )
  );
}

/**
 * A `PrimerSzerkesztoNezet` a helyi primerkiegészítések kurzoros szerkesztője.
 */
function PrimerSzerkesztoNezet({ adat, visszaMenu }) {
  const { exit } = useApp();
  const [szerkesztoAdat, setSzerkesztoAdat] = useState(adat);
  const [kijeloltSorIndex, setKijeloltSorIndex] = useState(0);
  const [kijeloltNevIndex, setKijeloltNevIndex] = useState(0);
  const [aktivPanel, setAktivPanel] = useState("nevek");
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setSzerkesztoAdat(adat);
    setKijeloltSorIndex(0);
    setKijeloltNevIndex(0);
    setAktivPanel("nevek");
    setUzenet(
      `Személyes primerforrás: ${sajatPrimerForrasCimke(
        adat?.localSettings?.primarySource ?? "default"
      )}`
    );
    setUzenetTipus("info");
  }, [adat]);

  const sorok = useMemo(() => lapitottSzerkesztoSorok(szerkesztoAdat?.months), [szerkesztoAdat]);
  const aktualisSor = sorok[kijeloltSorIndex] ?? null;
  const aktualisNevek = aktualisSor?.combinedMissing ?? [];
  const aktualisNev = aktualisNevek[kijeloltNevIndex] ?? null;
  const lathatoSorok = kijeloltAblak(sorok, kijeloltSorIndex, 12);

  useEffect(() => {
    if (sorok.length === 0) {
      setKijeloltSorIndex(0);
      return;
    }

    if (kijeloltSorIndex >= sorok.length) {
      setKijeloltSorIndex(sorok.length - 1);
    }
  }, [kijeloltSorIndex, sorok.length]);

  useEffect(() => {
    if (aktualisNevek.length === 0) {
      setKijeloltNevIndex(0);
      return;
    }

    if (kijeloltNevIndex >= aktualisNevek.length) {
      setKijeloltNevIndex(aktualisNevek.length - 1);
    }
  }, [aktualisNevek.length, kijeloltNevIndex]);

  useInput(async (input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (folyamatban) {
      return;
    }

    if (key.escape || input === "v") {
      visszaMenu();
      return;
    }

    if (key.tab || input === "p") {
      setAktivPanel((elozo) => (elozo === "nevek" ? "primerforras" : "nevek"));
      return;
    }

    if (sorok.length === 0) {
      return;
    }

    if (key.upArrow) {
      setKijeloltSorIndex((elozo) => (elozo - 1 + sorok.length) % sorok.length);
      return;
    }

    if (key.downArrow) {
      setKijeloltSorIndex((elozo) => (elozo + 1) % sorok.length);
      return;
    }

    if (aktivPanel === "primerforras" && (key.leftArrow || key.rightArrow || input === " ")) {
      const aktualisForras = szerkesztoAdat?.localSettings?.primarySource ?? "default";
      const irany = key.leftArrow ? -1 : 1;
      const kovetkezoForras = leptetEnumErteket(
        SAJAT_PRIMER_FORRAS_PROFILOK,
        aktualisForras,
        irany
      );

      setFolyamatban(true);
      try {
        const eredmeny = await allitSajatPrimerForrast(kovetkezoForras);
        setSzerkesztoAdat((elozo) => ({
          ...elozo,
          localSettings: {
            ...(elozo.localSettings ?? {}),
            primarySource: eredmeny.primarySource,
          },
        }));
        setUzenetTipus("siker");
        setUzenet(
          `Személyes primerforrás mentve: ${sajatPrimerForrasCimke(
            eredmeny.primarySource
          )}`
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
      return;
    }

    if (key.leftArrow && aktivPanel === "nevek" && aktualisNevek.length > 0) {
      setKijeloltNevIndex(
        (elozo) => (elozo - 1 + aktualisNevek.length) % aktualisNevek.length
      );
      return;
    }

    if (key.rightArrow && aktivPanel === "nevek" && aktualisNevek.length > 0) {
      setKijeloltNevIndex((elozo) => (elozo + 1) % aktualisNevek.length);
      return;
    }

    if (input === "r") {
      setFolyamatban(true);
      try {
        const friss = await betoltPrimerNelkulMaradoNevekSzerkesztoAdata();
        setSzerkesztoAdat(friss);
        setUzenetTipus("info");
        setUzenet("A riport és a helyi jelölések frissítve.");
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
      return;
    }

    if (input === "g") {
      setFolyamatban(true);
      try {
        const utvonalak = await generalKimenetet("ics");
        setUzenetTipus("siker");
        setUzenet(
          `Naptárak újragenerálva: ${utvonalak.map((utvonal) => relativUtvonal(utvonal)).join(", ")}`
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
      return;
    }

    if (input === " " && aktivPanel === "nevek" && aktualisSor && aktualisNev) {
      setFolyamatban(true);
      try {
        const eredmeny = await kapcsolPrimerNelkuliHelyiKiegeszitest({
          month: aktualisSor.month,
          day: aktualisSor.day,
          monthDay: aktualisSor.monthDay,
          name: aktualisNev.name,
        });

        setSzerkesztoAdat((elozo) =>
          frissitHelyiKijelolest(elozo, aktualisSor.monthDay, aktualisNev.name, eredmeny.selected)
        );
        setUzenetTipus("siker");
        setUzenet(
          eredmeny.selected
            ? `Hozzáadva a saját primerkiegészítésekhez: ${aktualisSor.monthDay} / ${aktualisNev.name}`
            : `Eltávolítva a saját primerkiegészítések közül: ${aktualisSor.monthDay} / ${aktualisNev.name}`
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
    }
  });

  if (sorok.length === 0) {
    return e(
      Box,
      { flexDirection: "column" },
      e(Text, { bold: true }, "Saját primer szerkesztő"),
      e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés"),
      e(Text, { marginTop: 1 }, "A riport jelenleg nem tartalmaz szerkeszthető napokat.")
    );
  }

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Saját primer szerkesztő"),
    e(
      Text,
      { dimColor: true },
      "↑/↓: nap • Tab vagy p: panelváltás • ←/→: név vagy primerforrás • Space: kapcsolás • g: saját naptár generálása • r: frissítés • Esc vagy v: vissza • q: kilépés"
    ),
    e(
      Text,
      { dimColor: true },
      `Riport: ${relativUtvonal(szerkesztoAdat.reportPath)} • Helyi felülírás: ${relativUtvonal(szerkesztoAdat.localOverridesPath)}`
    ),
    e(
      Text,
      { dimColor: true },
      `Érintett napok: ${szerkesztoAdat.summary?.rowCount ?? 0} • Helyben kijelölt nevek: ${szerkesztoAdat.summary?.localSelectedCount ?? 0} • Személyes primerforrás: ${sajatPrimerForrasCimke(
        szerkesztoAdat.localSettings?.primarySource ?? "default"
      )}`
    ),
    folyamatban
      ? e(Box, { marginTop: 1 }, e(Spinner, { label: "Művelet folyamatban..." }))
      : null,
    uzenet
      ? e(
          Text,
          {
            color:
              uzenetTipus === "hiba"
                ? "red"
                : uzenetTipus === "siker"
                  ? "green"
                  : "cyan",
          },
          uzenet
        )
      : null,
    e(
      Box,
      { marginTop: 1 },
      e(
        Box,
        { flexDirection: "column", width: 52, marginRight: 2 },
        e(Text, { bold: true }, "Érintett napok"),
        ...lathatoSorok.map((row) => {
          const helyiDarab = (row.combinedMissing ?? []).filter(
            (entry) => entry.localSelected === true
          ).length;

          return e(
            Box,
            { key: `${row.monthDay}-${row.globalIndex}` },
            e(
              Text,
              { color: row.globalIndex === kijeloltSorIndex ? "cyan" : undefined },
              row.globalIndex === kijeloltSorIndex ? "❯ " : "  "
            ),
            e(
              Text,
              {
                bold: true,
                color: primerNapSzine(row.finalPrimaryCount),
              },
              row.monthDay
            ),
            e(
              Text,
              null,
              ` • ${formataltNevek(row.finalPrimaryNames, 3)} • közös: ${(row.combinedMissing ?? []).length}${helyiDarab > 0 ? ` • helyi: ${helyiDarab}` : ""}`
            )
          );
        })
      ),
      e(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        e(
          Text,
          { bold: true },
          `Aktív panel: ${aktivPanel === "nevek" ? "helyi névkijelölés" : "személyes primerforrás"}`
        ),
        e(Text, { bold: true }, `${aktualisSor.monthName} • ${aktualisSor.monthDay}`),
        e(Text, null, `Végső primerek: ${formataltNevek(aktualisSor.finalPrimaryNames, 6)}`),
        e(
          Text,
          { dimColor: true },
          `Normalizált hiányok: ${formataltNevek(
            (aktualisSor.normalizedMissing ?? []).map((entry) => entry.name),
            6
          )}`
        ),
        e(
          Text,
          { dimColor: true },
          `Rangsorolt hiányok: ${formataltNevek(
            (aktualisSor.rankingMissing ?? []).map((entry) => entry.name),
            6
          )}`
        ),
        e(Text, { bold: true }, ""),
        e(Text, { bold: true }, "Közös jelöltek"),
        ...(aktualisNevek.length > 0
          ? aktualisNevek.map((entry, index) => {
              const prefix = index === kijeloltNevIndex ? "❯" : " ";
              const checkbox = entry.localSelected ? "[x]" : "[ ]";
              const color = entry.localSelected
                ? "green"
                : entry.highlight
                  ? "blue"
                  : index === kijeloltNevIndex && aktivPanel === "nevek"
                    ? "cyan"
                    : undefined;

              return e(
                Text,
                { key: `${aktualisSor.monthDay}-${entry.name}`, color },
                `${prefix} ${checkbox} ${entry.name} ${formatForrasJelzo(entry.sources)}${
                  aktivPanel === "nevek" && index === kijeloltNevIndex ? "  ←" : ""
                }`
              );
            })
          : [e(Text, { key: "ures-nevek", dimColor: true }, "Nincs szerkeszthető jelölt.")]),
        e(Text, { bold: true }, ""),
        e(Text, { bold: true }, "Személyes primerforrás"),
        ...SAJAT_PRIMER_FORRAS_PROFILOK.map((forras) =>
          e(
            Text,
            {
              key: `forras-${forras}`,
              color:
                szerkesztoAdat.localSettings?.primarySource === forras
                  ? "green"
                  : undefined,
            },
            `${aktivPanel === "primerforras" &&
            szerkesztoAdat.localSettings?.primarySource === forras
              ? "❯ "
              : "  "}${sajatPrimerForrasCimke(forras)}${
              szerkesztoAdat.localSettings?.primarySource === forras ? " [aktív]" : ""
            }`
          )
        ),
        e(
          Text,
          { dimColor: true },
          sajatPrimerForrasLeiras(szerkesztoAdat.localSettings?.primarySource ?? "default")
        ),
        e(Text, { bold: true }, ""),
        aktualisNev
          ? e(
              Box,
              { flexDirection: "column" },
              e(Text, { bold: true }, `Kiválasztott név: ${aktualisNev.name}`),
              e(Text, null, `Forrás: ${formatForrasJelzo(aktualisNev.sources)}`),
              e(
                Text,
                null,
                `Kapcsolódás aznapi végső primerekhez: ${aktualisNev.highlight ? "igen" : "nem"}`
              ),
              e(
                Text,
                { dimColor: !aktualisNev.highlight },
                aktualisNev.highlight
                  ? `Hasonló primer(ek): ${formataltNevek(
                      (aktualisNev.similarPrimaries ?? []).map(
                        (entry) => `${entry.primaryName} (${entry.relation})`
                      ),
                      6
                    )}`
                  : "Nincs közvetlen névkapcsolati jelölés az aznapi végső primerhez."
              )
            )
          : null
      )
    )
  );
}

/**
 * Az `AuditInspectorNezet` böngészhető, napi részletező nézetet ad a kiemelt auditokhoz.
 */
function AuditInspectorNezet({ adat, visszaMenu }) {
  const { exit } = useApp();
  const [inspectorAdat, setInspectorAdat] = useState(adat);
  const [kijeloltSorIndex, setKijeloltSorIndex] = useState(0);
  const [kijeloltReszletIndex, setKijeloltReszletIndex] = useState(0);
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setInspectorAdat(adat);
    setKijeloltSorIndex(0);
    setKijeloltReszletIndex(0);
    setUzenet(null);
    setUzenetTipus("info");
  }, [adat]);

  const sorok = useMemo(() => lapitottAuditSorok(inspectorAdat?.months), [inspectorAdat]);
  const aktualisSor = sorok[kijeloltSorIndex] ?? null;
  const lathatoSorok = kijeloltAblak(sorok, kijeloltSorIndex, 12);
  const reszletLista =
    inspectorAdat?.audit === "primer-nelkul-marado-nevek"
      ? aktualisSor?.combinedMissing ?? []
      : aktualisSor?.hidden ?? [];
  const aktualisReszlet = reszletLista[kijeloltReszletIndex] ?? null;

  useEffect(() => {
    if (sorok.length === 0) {
      setKijeloltSorIndex(0);
      return;
    }

    if (kijeloltSorIndex >= sorok.length) {
      setKijeloltSorIndex(sorok.length - 1);
    }
  }, [kijeloltSorIndex, sorok.length]);

  useEffect(() => {
    if (reszletLista.length === 0) {
      setKijeloltReszletIndex(0);
      return;
    }

    if (kijeloltReszletIndex >= reszletLista.length) {
      setKijeloltReszletIndex(reszletLista.length - 1);
    }
  }, [kijeloltReszletIndex, reszletLista.length]);

  useInput(async (input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (folyamatban) {
      return;
    }

    if (key.escape || input === "v") {
      visszaMenu();
      return;
    }

    if (sorok.length === 0) {
      return;
    }

    if (key.upArrow) {
      setKijeloltSorIndex((elozo) => (elozo - 1 + sorok.length) % sorok.length);
      return;
    }

    if (key.downArrow) {
      setKijeloltSorIndex((elozo) => (elozo + 1) % sorok.length);
      return;
    }

    if (reszletLista.length > 0 && key.leftArrow) {
      setKijeloltReszletIndex((elozo) => (elozo - 1 + reszletLista.length) % reszletLista.length);
      return;
    }

    if (reszletLista.length > 0 && key.rightArrow) {
      setKijeloltReszletIndex((elozo) => (elozo + 1) % reszletLista.length);
      return;
    }

    if (input === "r") {
      setFolyamatban(true);

      try {
        const friss = await betoltAuditInspectorAdata(inspectorAdat.audit);
        setInspectorAdat(friss);
        setUzenetTipus("info");
        setUzenet("Az audit-inspector friss riporttal újratöltve.");
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
    }
  });

  if (sorok.length === 0) {
    return e(
      Box,
      { flexDirection: "column" },
      e(Text, { bold: true }, "Audit inspector"),
      e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés"),
      e(Text, { marginTop: 1 }, "Az audit jelenleg nem tartalmaz böngészhető napi sorokat.")
    );
  }

  return e(
    Box,
    { flexDirection: "column" },
    e(
      Text,
      { bold: true },
      inspectorAdat.audit === "vegso-primer"
        ? "Végső primer audit inspector"
        : "Primer nélkül maradó nevek inspector"
    ),
    e(
      Text,
      { dimColor: true },
      "↑/↓: nap • ←/→: részlet • r: riportfrissítés • Esc vagy v: vissza • q: kilépés"
    ),
    e(
      Text,
      { dimColor: true },
      `Riport: ${relativUtvonal(inspectorAdat.reportPath)} • Generálva: ${inspectorAdat.generatedAt ?? "—"}`
    ),
    ...auditInspectorOsszegzesSorok(inspectorAdat).map((sor, index) =>
      e(Text, { key: `audit-summary-${index}`, dimColor: true }, sor)
    ),
    folyamatban
      ? e(Box, { marginTop: 1 }, e(Spinner, { label: "Riport frissítése..." }))
      : null,
    uzenet
      ? e(
          Text,
          {
            color:
              uzenetTipus === "hiba"
                ? "red"
                : uzenetTipus === "siker"
                  ? "green"
                  : "cyan",
          },
          uzenet
        )
      : null,
    e(
      Box,
      { marginTop: 1 },
      e(
        Box,
        { flexDirection: "column", width: 52, marginRight: 2 },
        e(Text, { bold: true }, "Böngészhető napok"),
        ...lathatoSorok.map((row) =>
          e(
            Box,
            { key: `${inspectorAdat.audit}-${row.monthDay}-${row.globalIndex}` },
            e(
              Text,
              { color: row.globalIndex === kijeloltSorIndex ? "cyan" : undefined },
              row.globalIndex === kijeloltSorIndex ? "❯ " : "  "
            ),
            renderAuditInspectorBalOldaliSor(inspectorAdat.audit, row)
          )
        )
      ),
      e(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        renderAuditInspectorReszletek(inspectorAdat, aktualisSor, aktualisReszlet, kijeloltReszletIndex)
      )
    )
  );
}

/**
 * Az `auditInspectorOsszegzesSorok` rövid státuszsort készít az inspector fejléce alá.
 */
function auditInspectorOsszegzesSorok(adat) {
  if (adat?.audit === "vegso-primer") {
    return [
      `Napok: ${adat.summary?.rowCount ?? 0} • Kemény hibák: ${adat.summary?.hardFailureCount ?? 0} • Felülírt napok: ${adat.summary?.overrideDayCount ?? 0}`,
      `Primer nélkül maradó nevek: ${adat.summary?.neverPrimaryCount ?? 0} • Ebből hasonló primerrel: ${adat.summary?.neverPrimaryWithSimilarPrimaryCount ?? 0}`,
    ];
  }

  return [
    `Érintett napok: ${adat.summary?.rowCount ?? 0} • Közös hiányzó nevek: ${adat.summary?.combinedMissingCount ?? 0} • Egyedi nevek: ${adat.summary?.uniqueMissingNameCount ?? 0}`,
    `Helyben kijelölt nevek: ${adat.summary?.localSelectedCount ?? 0} • Személyes primerforrás: ${sajatPrimerForrasCimke(
      adat.localSettings?.primarySource ?? "default"
    )}`,
  ];
}

/**
 * A `renderAuditInspectorBalOldaliSor` a bal oldali napi lista egyetlen sorát rajzolja ki.
 */
function renderAuditInspectorBalOldaliSor(auditAzonosito, row) {
  if (auditAzonosito === "vegso-primer") {
    return e(
      Text,
      null,
      e(Text, { bold: true, color: vegsoPrimerForrasSzine(row) }, row.monthDay),
      e(
        Text,
        null,
        ` • ${vegsoPrimerForrasCimke(row.source)} • primerek: ${formataltNevek(
          row.preferredNames,
          3
        )} • rejtett: ${(row.hidden ?? []).length}${row.warning ? " • figyelmeztetés" : ""}`
      )
    );
  }

  return e(
    Text,
    null,
    e(Text, { bold: true, color: primerNapSzine(row.finalPrimaryCount) }, row.monthDay),
    e(
      Text,
      null,
      ` • ${formataltNevek(row.finalPrimaryNames, 3)} • közös: ${(row.combinedMissing ?? []).length}`
    )
  );
}

/**
 * A `renderAuditInspectorReszletek` a kiválasztott napi sor jobb oldali, részletes paneljét rajzolja ki.
 */
function renderAuditInspectorReszletek(adat, row, aktualisReszlet, kijeloltReszletIndex) {
  if (!row) {
    return e(Text, null, "Nincs kijelölt sor.");
  }

  if (adat.audit === "vegso-primer") {
    return e(
      Box,
      { flexDirection: "column" },
      e(Text, { bold: true }, `${row.monthName} • ${row.monthDay}`),
      e(
        Text,
        { color: vegsoPrimerForrasSzine(row) },
        `Forrás: ${vegsoPrimerForrasCimke(row.source)}${row.warning ? " • figyelmeztetéses nap" : ""}`
      ),
      e(Text, null, `Végső primerek: ${formataltNevek(row.preferredNames, 8)}`),
      e(Text, { dimColor: true }, `Legacy: ${formataltNevek(row.legacy, 8)}`),
      e(Text, { dimColor: true }, `Wiki: ${formataltNevek(row.wiki, 8)}`),
      e(Text, { dimColor: true }, `Normalizált: ${formataltNevek(row.normalized, 8)}`),
      e(Text, { dimColor: true }, `Rangsorolt: ${formataltNevek(row.ranking, 8)}`),
      e(
        Text,
        { color: (row.hidden ?? []).length > 0 ? "red" : undefined },
        `Rejtett: ${formataltNevek(row.hidden, 8)}`
      ),
      e(
        Text,
        { dimColor: true },
        `Összes aznapi név: ${formataltNevek(row.names, 8)}`
      ),
      e(Text, { bold: true }, ""),
      e(Text, { bold: true }, "Rejtett nevek ezen a napon"),
      ...((row.hidden ?? []).length > 0
        ? row.hidden.map((name, index) =>
            e(
              Text,
              {
                key: `vegso-hidden-${row.monthDay}-${name}`,
                color: index === kijeloltReszletIndex ? "cyan" : "red",
              },
              `${index === kijeloltReszletIndex ? "❯ " : "  "}${name}`
            )
          )
        : [e(Text, { key: "vegso-hidden-ures", dimColor: true }, "Nincs rejtett név ezen a napon.")])
    );
  }

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, `${row.monthName} • ${row.monthDay}`),
    e(Text, { color: primerNapSzine(row.finalPrimaryCount) }, `Végső primerek: ${formataltNevek(row.finalPrimaryNames, 8)}`),
    e(Text, { dimColor: true }, `Közös hiányok: ${formataltNevek((row.combinedMissing ?? []).map((entry) => `${entry.name} ${formatForrasJelzo(entry.sources)}`), 8)}`),
    e(Text, { dimColor: true }, `Normalizált hiányok: ${formataltNevek((row.normalizedMissing ?? []).map((entry) => entry.name), 8)}`),
    e(Text, { dimColor: true }, `Rangsorolt hiányok: ${formataltNevek((row.rankingMissing ?? []).map((entry) => entry.name), 8)}`),
    e(Text, { bold: true }, ""),
    e(Text, { bold: true }, "Közös hiányzó nevek"),
    ...((row.combinedMissing ?? []).length > 0
      ? row.combinedMissing.map((entry, index) =>
          e(
            Text,
            {
              key: `primer-nelkul-combined-${row.monthDay}-${entry.name}`,
              color: entry.localSelected ? "green" : entry.highlight ? "blue" : index === kijeloltReszletIndex ? "cyan" : undefined,
            },
            `${index === kijeloltReszletIndex ? "❯ " : "  "}${entry.name} ${formatForrasJelzo(entry.sources)}${
              entry.localSelected ? " [helyi]" : ""
            }`
          )
        )
      : [e(Text, { key: "primer-nelkul-combined-ures", dimColor: true }, "Nincs közös hiányzó név.")]),
    e(Text, { bold: true }, ""),
    aktualisReszlet
      ? e(
          Box,
          { flexDirection: "column" },
          e(Text, { bold: true }, `Kiválasztott név: ${aktualisReszlet.name}`),
          e(Text, null, `Forrásjelölés: ${formatForrasJelzo(aktualisReszlet.sources)}`),
          e(Text, null, `Kapcsolódik aznapi primerhez: ${aktualisReszlet.highlight ? "igen" : "nem"}`),
          e(
            Text,
            { dimColor: !aktualisReszlet.highlight },
            aktualisReszlet.highlight
              ? `Hasonló primerek: ${formataltKapcsolodoPrimerek(
                  aktualisReszlet.similarPrimaries,
                  6
                )}`
              : "Nincs közvetlen névkapcsolati jelölés az aznapi végső primerhez."
          ),
          e(
            Text,
            { dimColor: true },
            `Személyes primerben: ${aktualisReszlet.localSelected ? "igen" : "nem"}`
          )
        )
      : null
  );
}

/**
 * A `formataltEredmenySorok` emberileg olvasható sorokra bontja a műveleti eredményt.
 */
function formataltEredmenySorok(eredmeny) {
  if (eredmeny == null) {
    return ["(nincs eredmény)"];
  }

  if (Array.isArray(eredmeny)) {
    if (eredmeny.length === 0) {
      return ["(üres lista)"];
    }

    return eredmeny.map((ertek) => formataltListaElem(ertek));
  }

  if (typeof eredmeny === "object") {
    return Object.entries(eredmeny).map(([kulcs, ertek]) => `${kulcs}: ${formataltErtek(ertek)}`);
  }

  return [String(eredmeny)];
}

/**
 * A `formataltListaElem` a szolgáltatási rétegből visszaadott listaelemekhez emberi olvasatú összefoglalót készít.
 */
function formataltListaElem(ertek) {
  if (!ertek || typeof ertek !== "object") {
    return `- ${String(ertek)}`;
  }

  if (typeof ertek.azonosito === "string") {
    if (ertek.kihagyva) {
      return `- ${ertek.azonosito}: kihagyva${ertek.indok ? ` (${ertek.indok})` : ""}`;
    }

    return `- ${ertek.azonosito}: lefutott`;
  }

  if (typeof ertek.audit === "string") {
    return `- audit: ${ertek.audit}${ertek.reportPath ? ` → ${ertek.reportPath}` : ""}`;
  }

  if (typeof ertek.stepId === "string") {
    return `- ${ertek.stepId}: ${ertek.status ?? "ismeretlen állapot"}`;
  }

  return `- ${JSON.stringify(ertek)}`;
}

/**
 * A `formataltErtek` rövid, olvasható sztringgé alakítja a TUI eredményértékeit.
 */
function formataltErtek(ertek) {
  if (ertek == null) {
    return "—";
  }

  if (Array.isArray(ertek)) {
    return ertek.join(", ");
  }

  if (typeof ertek === "object") {
    return JSON.stringify(ertek);
  }

  return String(ertek);
}

/**
 * A `TuiAlkalmazas` kezeli a menüállapotot és az interaktív billentyűparancsokat.
 */
function TuiAlkalmazas({ kezdoNezet = "menu" }) {
  const { exit } = useApp();
  const kezdoAzonosito =
    kezdoNezet === "primer-szerkeszto" ||
    kezdoNezet === "ics" ||
    kezdoNezet === "audit-vegso-primer-inspector" ||
    kezdoNezet === "audit-primer-nelkul-inspector"
      ? kezdoNezet
      : kezdoNezet === "ics-beallitasok"
        ? "ics"
        : "allapot";
  const kezdoIndex = keresMenuPontIndexet(kezdoAzonosito);
  const [kijelolt, setKijelolt] = useState(kezdoNezet === "menu" ? 0 : kezdoIndex);
  const [allapot, setAllapot] = useState(kezdoNezet === "menu" ? "menu" : "betoltes");
  const [aktivPont, setAktivPont] = useState(menuPontok[kezdoNezet === "menu" ? 0 : kezdoIndex]);
  const [eredmeny, setEredmeny] = useState(null);
  const [hiba, setHiba] = useState(null);

  useEffect(() => {
    if (kezdoNezet === "menu") {
      return;
    }

    let megszakitva = false;

    async function autoInditas() {
      try {
        const valasz = await menuPontok[kezdoIndex].vegrehajt();

        if (megszakitva) {
          return;
        }

        if (valasz.tipus === "kilepes") {
          exit();
          return;
        }

        setEredmeny(valasz);
        setAllapot(
          valasz.tipus === "primer-szerkeszto"
            ? "primer-szerkeszto"
            : valasz.tipus === "ics-beallitasok"
              ? "ics-beallitasok"
              : valasz.tipus === "audit-inspector"
                ? "audit-inspector"
              : "eredmeny"
        );
      } catch (error) {
        if (!megszakitva) {
          setHiba(error);
          setAllapot("hiba");
        }
      }
    }

    void autoInditas();

    return () => {
      megszakitva = true;
    };
  }, [exit, kezdoIndex, kezdoNezet]);

  useInput(async (input, key) => {
    if (
      allapot === "primer-szerkeszto" ||
      allapot === "ics-beallitasok" ||
      allapot === "audit-inspector"
    ) {
      return;
    }

    if (allapot === "menu") {
      if (key.upArrow) {
        setKijelolt((elozo) => (elozo - 1 + menuPontok.length) % menuPontok.length);
        return;
      }

      if (key.downArrow) {
        setKijelolt((elozo) => (elozo + 1) % menuPontok.length);
        return;
      }

      if (key.return) {
        const kovetkezoPont = menuPontok[kijelolt];
        setAktivPont(kovetkezoPont);
        setAllapot("betoltes");
        setHiba(null);

        try {
          const valasz = await kovetkezoPont.vegrehajt();
          if (valasz.tipus === "kilepes") {
            exit();
            return;
          }
          setEredmeny(valasz);
          setAllapot(
            valasz.tipus === "primer-szerkeszto"
              ? "primer-szerkeszto"
              : valasz.tipus === "ics-beallitasok"
                ? "ics-beallitasok"
                : valasz.tipus === "audit-inspector"
                  ? "audit-inspector"
                : "eredmeny"
          );
        } catch (error) {
          setHiba(error);
          setAllapot("hiba");
        }
      }

      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (key.escape || input === "v") {
      setAllapot("menu");
      setEredmeny(null);
      setHiba(null);
    }
  });

  const nezet = useMemo(() => {
    if (allapot === "menu") {
      return e(MenuNezet, { kijelolt });
    }

    if (allapot === "betoltes") {
      return e(BetoltesNezet, { aktivPont });
    }

    if (allapot === "hiba") {
      return e(HibaNezet, { hiba });
    }

    if (allapot === "primer-szerkeszto") {
      return e(PrimerSzerkesztoNezet, {
        adat: eredmeny?.adat ?? eredmeny,
        visszaMenu: () => {
          setAllapot("menu");
          setEredmeny(null);
          setHiba(null);
        },
      });
    }

    if (allapot === "ics-beallitasok") {
      return e(ICSBeallitasNezet, {
        adat: eredmeny?.adat ?? eredmeny,
        visszaMenu: () => {
          setAllapot("menu");
          setEredmeny(null);
          setHiba(null);
        },
      });
    }

    if (allapot === "audit-inspector") {
      return e(AuditInspectorNezet, {
        adat: eredmeny?.adat ?? eredmeny,
        visszaMenu: () => {
          setAllapot("menu");
          setEredmeny(null);
          setHiba(null);
        },
      });
    }

    if (allapot === "eredmeny" && eredmeny?.tipus === "allapot") {
      return e(AllapotNezet, { sorok: eredmeny.adat });
    }

    return e(EredmenyNezet, { aktivPont, eredmeny: eredmeny?.adat ?? eredmeny });
  }, [aktivPont, allapot, eredmeny, hiba, kijelolt]);

  return e(Box, { padding: 1 }, nezet);
}

/**
 * A `futtatTui` elindítja az Ink-alapú terminálfelületet.
 */
export async function futtatTui(opciok = {}) {
  const app = render(e(TuiAlkalmazas, { kezdoNezet: opciok.kezdoNezet ?? "menu" }));
  await app.waitUntilExit();
}
