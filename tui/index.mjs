/**
 * tui/index.mjs
 * Ink-alapú interaktív terminálfelület a pipeline-hoz, auditokhoz és a helyi primer-szerkesztőhöz.
 */

import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import {
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
const ALAPERTELMEZETT_ICS_BEALLITASOK = {
  splitPrimaryRest: false,
  mode: "together",
  primarySource: "default",
  primaryCalendarMode: "together",
  restCalendarMode: "together",
  leapMode: "none",
  leapStrategy: "a",
  fromYear: new Date().getFullYear(),
  untilYear: 2050,
  baseYear: 2000,
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
  },
  {
    kulcs: "primarySource",
    cimke: "Primerforrás",
    tipus: "enum",
    ertekek: ["default", "legacy", "ranked", "either"],
  },
  {
    kulcs: "primaryCalendarMode",
    cimke: "Elsődleges naptár módja",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
  },
  {
    kulcs: "restCalendarMode",
    cimke: "További naptár módja",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
  },
  {
    kulcs: "leapMode",
    cimke: "Szökőéves mód",
    tipus: "enum",
    ertekek: ["none", "hungarian-until-2050"],
  },
  {
    kulcs: "leapStrategy",
    cimke: "Szökőéves stratégia",
    tipus: "enum",
    ertekek: ["a", "b", "both"],
  },
  {
    kulcs: "fromYear",
    cimke: "Szökőéves tartomány kezdete",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
  },
  {
    kulcs: "untilYear",
    cimke: "Szökőéves tartomány vége",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
  },
  {
    kulcs: "baseYear",
    cimke: "Bázisév",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
  },
  {
    kulcs: "descriptionMode",
    cimke: "Leírásmód",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
  },
  {
    kulcs: "descriptionFormat",
    cimke: "Leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
  },
  {
    kulcs: "ordinalDay",
    cimke: "Év napja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
  },
  {
    kulcs: "includeOtherDays",
    cimke: "További névnapok a leírásban",
    tipus: "boolean",
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
    azonosito: "audit-primer-nelkul",
    cim: "Primer nélkül maradó nevek audit",
    leiras: "Havi bontásban mutatja a végső primerkészletből kimaradó normalizált és rangsorolt neveket.",
    vegrehajt: async () => ({
      tipus: "audit",
      adat: await futtatAuditot("primer-nelkul-marado-nevek"),
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
    primarySource: {
      default: "alapértelmezett (legacy + ranking)",
      legacy: "legacy",
      ranked: "rangsorolt",
      either: "legacy vagy rangsorolt (legfeljebb 2)",
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
  reszek.push(`--primary-source ${beallitasok.primarySource}`);
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
    setUzenet(null);
    setUzenetTipus("info");
  }, [adat]);

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
      setKijeloltIndex(
        (elozo) => (elozo - 1 + ICS_BEALLITAS_DEFINICIOK.length) % ICS_BEALLITAS_DEFINICIOK.length
      );
      return;
    }

    if (key.downArrow) {
      setKijeloltIndex((elozo) => (elozo + 1) % ICS_BEALLITAS_DEFINICIOK.length);
      return;
    }

    const aktualisDefinicio = ICS_BEALLITAS_DEFINICIOK[kijeloltIndex];

    if (key.leftArrow) {
      setBeallitasok((elozo) => frissitIcsBeallitast(elozo, aktualisDefinicio, -1));
      return;
    }

    if (key.rightArrow) {
      setBeallitasok((elozo) => frissitIcsBeallitast(elozo, aktualisDefinicio, 1));
      return;
    }

    if (input === " ") {
      setBeallitasok((elozo) => frissitIcsBeallitast(elozo, aktualisDefinicio, 1));
      return;
    }

    if (input === "r") {
      setBeallitasok({ ...ALAPERTELMEZETT_ICS_BEALLITASOK });
      setUzenetTipus("info");
      setUzenet("Az ICS-beállítások visszaálltak az alapértékekre.");
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
        e(Text, { bold: true }, "Megjegyzés"),
        e(
          Text,
          null,
          "Ha létezik helyi primerkiegészítés, a generálás a közös naptár mellett egy saját primeres ICS-t is készíthet."
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
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setSzerkesztoAdat(adat);
    setKijeloltSorIndex(0);
    setKijeloltNevIndex(0);
    setUzenet(null);
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

    if (key.leftArrow && aktualisNevek.length > 0) {
      setKijeloltNevIndex(
        (elozo) => (elozo - 1 + aktualisNevek.length) % aktualisNevek.length
      );
      return;
    }

    if (key.rightArrow && aktualisNevek.length > 0) {
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

    if (input === " " && aktualisSor && aktualisNev) {
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
      "↑/↓: nap • ←/→: név • Space: helyi primer hozzáadása/eltávolítása • g: saját naptár generálása • r: frissítés • Esc vagy v: vissza • q: kilépés"
    ),
    e(
      Text,
      { dimColor: true },
      `Riport: ${relativUtvonal(szerkesztoAdat.reportPath)} • Helyi felülírás: ${relativUtvonal(szerkesztoAdat.localOverridesPath)}`
    ),
    e(
      Text,
      { dimColor: true },
      `Érintett napok: ${szerkesztoAdat.summary?.rowCount ?? 0} • Helyben kijelölt nevek: ${szerkesztoAdat.summary?.localSelectedCount ?? 0}`
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
                color:
                  row.finalPrimaryCount === 1
                    ? "green"
                    : row.finalPrimaryCount === 2
                      ? "yellow"
                      : row.finalPrimaryCount >= 3
                        ? "red"
                        : undefined,
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
        e(Text, { bold: true }, `${aktualisSor.monthName} • ${aktualisSor.monthDay}`),
        e(Text, null, `Végső primerek: ${formataltNevek(aktualisSor.finalPrimaryNames, 6)}`),
        e(Text, { dimColor: true }, `Normalizált hiányok: ${formataltNevek((aktualisSor.normalizedMissing ?? []).map((entry) => entry.name), 6)}`),
        e(Text, { dimColor: true }, `Rangsorolt hiányok: ${formataltNevek((aktualisSor.rankingMissing ?? []).map((entry) => entry.name), 6)}`),
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
                  : index === kijeloltNevIndex
                    ? "cyan"
                    : undefined;

              return e(
                Text,
                { key: `${aktualisSor.monthDay}-${entry.name}`, color },
                `${prefix} ${checkbox} ${entry.name} ${formatForrasJelzo(entry.sources)}`
              );
            })
          : [e(Text, { key: "ures-nevek", dimColor: true }, "Nincs szerkeszthető jelölt.")]),
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
    kezdoNezet === "primer-szerkeszto" || kezdoNezet === "ics"
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
    if (allapot === "primer-szerkeszto" || allapot === "ics-beallitasok") {
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
