/**
 * tui/index.mjs
 * Ink-alapú interaktív terminálfelület a pipeline-hoz, auditokhoz és a helyi primer-szerkesztőhöz.
 */

import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  allitIcsBeallitasokat,
  allitSajatPrimerBeallitasokat,
  betoltAuditInspectorAdata,
  betoltIcsBeallitasokat,
  betoltPrimerNelkulMaradoNevekSzerkesztoAdata,
  kapcsolPrimerNelkuliHelyiKiegeszitest,
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  pipelineAllapot,
  visszaallitIcsBeallitasokat,
} from "../index.mjs";
import { szerializalStrukturaltAdat } from "../kozos/strukturalt-fajl.mjs";
import {
  ICS_BEALLITAS_DEFINICIOK,
  epitIcsOutputProfilt,
  icsErtekCimke,
  normalizalIcsBeallitasokat,
} from "../domainek/naptar/ics-beallitasok.mjs";

const e = React.createElement;
const KOZOS_FORRAS_CIMKEK = {
  normalized: "N",
  ranking: "R",
};
const SAJAT_PRIMER_FORRAS_PROFILOK = ["default", "legacy", "ranked", "either"];
const SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK = [
  {
    kulcs: "primarySource",
    cimke: "Primerforrás",
    tipus: "enum",
    ertekek: SAJAT_PRIMER_FORRAS_PROFILOK,
  },
  {
    kulcs: "modifiers.normalized",
    cimke: "Normalizált módosító",
    tipus: "boolean",
  },
  {
    kulcs: "modifiers.ranking",
    cimke: "Rangsor módosító",
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
    leiras: "Megnyitja a mentett helyi ICS-profilt, és abból generál naptárt.",
    vegrehajt: async () => ({
      tipus: "ics-beallitasok",
      adat: await betoltIcsBeallitasokat(),
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

function getNestedValue(objektum, utvonal) {
  return String(utvonal)
    .split(".")
    .reduce((aktualis, kulcs) => aktualis?.[kulcs], objektum);
}

function setNestedValue(objektum, utvonal, ertek) {
  const kulcsok = String(utvonal).split(".");
  const uj = { ...(objektum ?? {}) };
  let aktualis = uj;

  for (let index = 0; index < kulcsok.length - 1; index += 1) {
    const kulcs = kulcsok[index];
    aktualis[kulcs] = { ...(aktualis[kulcs] ?? {}) };
    aktualis = aktualis[kulcs];
  }

  aktualis[kulcsok[kulcsok.length - 1]] = ertek;
  return uj;
}

/**
 * Az `icsBeallitasLeiras` részletes magyarázatot ad az aktuálisan kijelölt ICS-kapcsolóhoz.
 */
function icsBeallitasLeiras(definicio, beallitasok) {
  if (!definicio) {
    return [];
  }

  const aktualisErtek = getNestedValue(beallitasok, definicio.kulcs);
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

  return `${definicio.cimke} → ${icsErtekCimke(definicio.kulcs, getNestedValue(beallitasok, definicio.kulcs))}. ${sorok.slice(2).join(" ")}`.trim();
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
      "Személyes ICS módban az alap primerlogika marad: a legacy elsődlegesekhez szükség esetén rangsorolt kiegészítés társul.",
    legacy:
      "Személyes ICS módban a primeres rész csak a legacy elsődleges kijelölésre támaszkodik. Akkor hasznos, ha a régi, hagyományos névnaprendhez akarsz közelebb maradni.",
    ranked:
      "Személyes ICS módban a primeres rész a rangsorolt névjelölésekre épül. Ez modernebb, gyakorisági alapú fókuszt adhat a naptárnak.",
    either:
      "Személyes ICS módban a legacy és a rangsorolt primerjelölés uniója használható. Ez bővebb primerlistát eredményezhet, de zajosabb is lehet.",
  };

  return leirasok[ertek] ?? String(ertek);
}

function szemelyesModifierLeiras(kulcs, aktiv) {
  if (kulcs === "modifiers.normalized") {
    return aktiv
      ? "A normalizált hiányok személyes ICS módban automatikusan beleszólnak a kimenetbe."
      : "A normalizált hiányok nem szólnak bele automatikusan a személyes ICS-be.";
  }

  if (kulcs === "modifiers.ranking") {
    return aktiv
      ? "A rangsorolt hiányok személyes ICS módban automatikusan beleszólnak a kimenetbe."
      : "A rangsorolt hiányok nem szólnak bele automatikusan a személyes ICS-be.";
  }

  return "";
}

function szemelyesBeallitasCimke(definicio, beallitasok) {
  const ertek = getNestedValue(beallitasok, definicio.kulcs);

  if (definicio.kulcs === "primarySource") {
    return sajatPrimerForrasCimke(ertek);
  }

  return ertek ? "bekapcsolva" : "kikapcsolva";
}

function szemelyesBeallitasLeiras(definicio, beallitasok) {
  const ertek = getNestedValue(beallitasok, definicio.kulcs);

  if (definicio.kulcs === "primarySource") {
    return sajatPrimerForrasLeiras(ertek);
  }

  return szemelyesModifierLeiras(definicio.kulcs, ertek === true);
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
  const aktualisErtek = getNestedValue(beallitasok, definicio.kulcs);

  if (definicio.tipus === "boolean") {
    return normalizalIcsBeallitasokat(setNestedValue(beallitasok, definicio.kulcs, !aktualisErtek));
  }

  if (definicio.tipus === "enum") {
    return normalizalIcsBeallitasokat(
      setNestedValue(
        beallitasok,
        definicio.kulcs,
        leptetEnumErteket(definicio.ertekek, aktualisErtek, irany)
      )
    );
  }

  if (definicio.tipus === "number") {
    const step = definicio.step ?? 1;
    const min = definicio.min ?? Number.MIN_SAFE_INTEGER;
    const max = definicio.max ?? Number.MAX_SAFE_INTEGER;
    const kovetkezo = Math.max(min, Math.min(max, Number(aktualisErtek) + irany * step));

    return normalizalIcsBeallitasokat(setNestedValue(beallitasok, definicio.kulcs, kovetkezo));
  }

  return beallitasok;
}

/**
 * A `buildIcsYamlElozetet` rövid YAML-előnézetet ad a TUI ICS-beállításaihoz.
 */
function buildIcsYamlElozetet(beallitasok) {
  return szerializalStrukturaltAdat({
    ics: beallitasok,
  }).trimEnd();
}

function lathatoIcsBeallitasDefiniciok(beallitasok) {
  return ICS_BEALLITAS_DEFINICIOK.filter((definicio) =>
    typeof definicio.lathato === "function" ? definicio.lathato(beallitasok) : true
  );
}

function buildIcsKimenetiOsszegzest(beallitasok) {
  const profil = epitIcsOutputProfilt(beallitasok);
  const sorok = [
    `Aktív mód: ${icsErtekCimke("outputMode", profil.settings.outputMode)}`,
    `Létrejövő fájlok: ${profil.activeBaseOutputs.map((utvonal) => relativUtvonal(utvonal)).join(" • ")}`,
  ];

  if (profil.settings.leapProfile === "hungarian-both") {
    sorok.push("Szökőéves A+B profilnál a tényleges fájlnevek -A és -B utótagot kapnak.");
  }

  if (profil.usesPersonalPrimary) {
    sorok.push(
      "A személyes primerforrás, a Normalizált és a Rangsor módosító, valamint a kézi helyi kiegészítések most aktívak."
    );
  } else {
    sorok.push("A személyes primerprofil most nem hoz létre külön ICS-t.");
  }

  sorok.push("A generálás az inaktív, menedzselt ICS-kimeneteket eltakarítja a kimeneti mappából.");

  return sorok;
}

/**
 * Az `ICSBeallitasNezet` az ortogonális ICS-kapcsolókat TUI-ból is vezérelhetővé teszi.
 */
function ICSBeallitasNezet({ adat, visszaMenu }) {
  const { exit } = useApp();
  const [beallitasok, setBeallitasok] = useState(adat?.settings ?? adat ?? {});
  const [configPath, setConfigPath] = useState(adat?.configPath ?? ".local/nevnapok.local.yaml");
  const [kijeloltIndex, setKijeloltIndex] = useState(0);
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setBeallitasok(adat?.settings ?? adat ?? {});
    setConfigPath(adat?.configPath ?? ".local/nevnapok.local.yaml");
    setKijeloltIndex(0);
    const kezdoDefinicio = lathatoIcsBeallitasDefiniciok(adat?.settings ?? adat ?? {})[0] ?? null;
    setUzenet(icsBeallitasValtozasUzenet(kezdoDefinicio, adat?.settings ?? adat ?? {}));
    setUzenetTipus("info");
  }, [adat]);

  const lathatoDefiniciok = useMemo(
    () => lathatoIcsBeallitasDefiniciok(beallitasok),
    [beallitasok]
  );

  useEffect(() => {
    if (lathatoDefiniciok.length === 0) {
      setKijeloltIndex(0);
      return;
    }

    if (kijeloltIndex >= lathatoDefiniciok.length) {
      setKijeloltIndex(lathatoDefiniciok.length - 1);
    }
  }, [kijeloltIndex, lathatoDefiniciok.length]);

  const aktualisDefinicio = lathatoDefiniciok[kijeloltIndex] ?? null;
  const helpSorok = icsBeallitasLeiras(aktualisDefinicio, beallitasok);
  const kimenetiOsszegzes = buildIcsKimenetiOsszegzest(beallitasok);

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
          (elozo - 1 + lathatoDefiniciok.length) % Math.max(lathatoDefiniciok.length, 1);
        setUzenet(icsBeallitasValtozasUzenet(lathatoDefiniciok[kovetkezo], beallitasok));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (key.downArrow) {
      setKijeloltIndex((elozo) => {
        const kovetkezo = (elozo + 1) % Math.max(lathatoDefiniciok.length, 1);
        setUzenet(icsBeallitasValtozasUzenet(lathatoDefiniciok[kovetkezo], beallitasok));
        setUzenetTipus("info");
        return kovetkezo;
      });
      return;
    }

    if (key.leftArrow) {
      const kovetkezo = frissitIcsBeallitast(beallitasok, aktualisDefinicio, -1);

      try {
        const eredmeny = await allitIcsBeallitasokat(kovetkezo);
        setBeallitasok(eredmeny.settings);
        setConfigPath(eredmeny.configPath);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, eredmeny.settings));
        setUzenetTipus("info");
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      }
      return;
    }

    if (key.rightArrow) {
      const kovetkezo = frissitIcsBeallitast(beallitasok, aktualisDefinicio, 1);

      try {
        const eredmeny = await allitIcsBeallitasokat(kovetkezo);
        setBeallitasok(eredmeny.settings);
        setConfigPath(eredmeny.configPath);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, eredmeny.settings));
        setUzenetTipus("info");
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      }
      return;
    }

    if (input === " ") {
      const kovetkezo = frissitIcsBeallitast(beallitasok, aktualisDefinicio, 1);

      try {
        const eredmeny = await allitIcsBeallitasokat(kovetkezo);
        setBeallitasok(eredmeny.settings);
        setConfigPath(eredmeny.configPath);
        setUzenet(icsBeallitasValtozasUzenet(aktualisDefinicio, eredmeny.settings));
        setUzenetTipus("info");
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      }
      return;
    }

    if (input === "r") {
      try {
        const eredmeny = await visszaallitIcsBeallitasokat();
        setBeallitasok(eredmeny.settings);
        setConfigPath(eredmeny.configPath);
        setUzenetTipus("info");
        setUzenet(
          "Az ICS-beállítások visszaálltak az alapértékekre, és a helyi YAML-fájl is frissült."
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      }
      return;
    }

    if (key.return) {
      setFolyamatban(true);

      try {
        const utvonalak = await generalKimenetet("ics");
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
      `Mentett helyi profil: ${configPath}`
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
        ...lathatoDefiniciok.map((definicio, index) =>
          e(
            Text,
            {
              key: definicio.kulcs,
              color: index === kijeloltIndex ? "cyan" : undefined,
            },
            `${index === kijeloltIndex ? "❯" : " "} ${definicio.cimke}: ${icsErtekCimke(
              definicio.kulcs,
              getNestedValue(beallitasok, definicio.kulcs)
            )}`
          )
        )
      ),
      e(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        e(Text, { bold: true }, "Mentett helyi profil összegzése"),
        ...kimenetiOsszegzes.map((sor, index) => e(Text, { key: `ics-output-${index}` }, sor)),
        e(Text, { bold: true }, ""),
        e(Text, { bold: true }, "YAML-előnézet"),
        e(Text, null, buildIcsYamlElozetet(beallitasok)),
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
          "A nevnapok kimenet general ics már kizárólag a mentett helyi YAML-profilt használja, és csak az aktív kimenet módhoz tartozó ICS-eket hagyja meg. A személyes primerforrás és a Normalizált / Rangsor módosítók a Saját primer szerkesztőben kezelhetők."
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
  const [kijeloltBeallitasIndex, setKijeloltBeallitasIndex] = useState(0);
  const [aktivPanel, setAktivPanel] = useState("nevek");
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState(null);
  const [uzenetTipus, setUzenetTipus] = useState("info");

  useEffect(() => {
    setSzerkesztoAdat(adat);
    setKijeloltSorIndex(0);
    setKijeloltNevIndex(0);
    setKijeloltBeallitasIndex(0);
    setAktivPanel("nevek");
    setUzenet(
      `Személyes primerbeállítások betöltve: ${sajatPrimerForrasCimke(
        adat?.localSettings?.primarySource ?? "default"
      )}`
    );
    setUzenetTipus("info");
  }, [adat]);

  const sorok = useMemo(() => lapitottSzerkesztoSorok(szerkesztoAdat?.months), [szerkesztoAdat]);
  const aktualisSor = sorok[kijeloltSorIndex] ?? null;
  const aktualisNevek = aktualisSor?.combinedMissing ?? [];
  const aktualisNev = aktualisNevek[kijeloltNevIndex] ?? null;
  const aktualisBeallitasDefinicio =
    SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK[kijeloltBeallitasIndex] ?? null;
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
      setAktivPanel((elozo) => (elozo === "nevek" ? "beallitasok" : "nevek"));
      return;
    }

    if (key.upArrow) {
      if (aktivPanel === "beallitasok") {
        setKijeloltBeallitasIndex(
          (elozo) =>
            (elozo - 1 + SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.length) %
            SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.length
        );
        return;
      }

      if (sorok.length === 0) {
        return;
      }

      setKijeloltSorIndex((elozo) => (elozo - 1 + sorok.length) % sorok.length);
      return;
    }

    if (key.downArrow) {
      if (aktivPanel === "beallitasok") {
        setKijeloltBeallitasIndex(
          (elozo) => (elozo + 1) % SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.length
        );
        return;
      }

      if (sorok.length === 0) {
        return;
      }

      setKijeloltSorIndex((elozo) => (elozo + 1) % sorok.length);
      return;
    }

    if (aktivPanel === "beallitasok" && (key.leftArrow || key.rightArrow || input === " ")) {
      if (!aktualisBeallitasDefinicio) {
        return;
      }

      const aktualisErtek = getNestedValue(
        szerkesztoAdat?.localSettings ?? {},
        aktualisBeallitasDefinicio.kulcs
      );
      let kovetkezoErtek = aktualisErtek;

      if (aktualisBeallitasDefinicio.tipus === "enum") {
        const irany = key.leftArrow ? -1 : 1;
        kovetkezoErtek = leptetEnumErteket(
          aktualisBeallitasDefinicio.ertekek,
          aktualisErtek,
          irany
        );
      } else if (aktualisBeallitasDefinicio.tipus === "boolean") {
        kovetkezoErtek = !(aktualisErtek === true);
      }

      const kovetkezoSettings = setNestedValue(
        szerkesztoAdat?.localSettings ?? {},
        aktualisBeallitasDefinicio.kulcs,
        kovetkezoErtek
      );

      setFolyamatban(true);
      try {
        const eredmeny = await allitSajatPrimerBeallitasokat({
          primarySource: kovetkezoSettings.primarySource,
          modifiers: kovetkezoSettings.modifiers,
        });
        setSzerkesztoAdat((elozo) => ({
          ...elozo,
          localSettings: eredmeny.settings,
        }));
        setUzenetTipus("siker");
        setUzenet(
          `Személyes beállítás mentve: ${aktualisBeallitasDefinicio.cimke} → ${szemelyesBeallitasCimke(
            aktualisBeallitasDefinicio,
            eredmeny.settings
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

    if (sorok.length === 0) {
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
      e(
        Text,
        { dimColor: true, marginTop: 1 },
        `Személyes primerforrás: ${sajatPrimerForrasCimke(
          szerkesztoAdat?.localSettings?.primarySource ?? "default"
        )} • Normalizált: ${
          szerkesztoAdat?.localSettings?.modifiers?.normalized ? "be" : "ki"
        } • Rangsor: ${szerkesztoAdat?.localSettings?.modifiers?.ranking ? "be" : "ki"}`
      ),
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
      "↑/↓: nap vagy beállítás • Tab vagy p: panelváltás • ←/→: név vagy beállítás • Space: kapcsolás • g: mentett ICS profil szerinti generálás • r: frissítés • Esc vagy v: vissza • q: kilépés"
    ),
    e(
      Text,
      { dimColor: true },
      `Riport: ${relativUtvonal(szerkesztoAdat.reportPath)} • Helyi konfig: ${relativUtvonal(szerkesztoAdat.localOverridesPath)}`
    ),
    e(
      Text,
      { dimColor: true },
      `Érintett napok: ${szerkesztoAdat.summary?.rowCount ?? 0} • Helyben kijelölt nevek: ${szerkesztoAdat.summary?.localSelectedCount ?? 0} • Személyes primerforrás: ${sajatPrimerForrasCimke(
        szerkesztoAdat.localSettings?.primarySource ?? "default"
      )} • Normalizált: ${
        szerkesztoAdat.localSettings?.modifiers?.normalized ? "be" : "ki"
      } • Rangsor: ${szerkesztoAdat.localSettings?.modifiers?.ranking ? "be" : "ki"}`
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
          `Aktív panel: ${aktivPanel === "nevek" ? "helyi névkijelölés" : "személyes primerbeállítások"}`
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
        e(Text, { bold: true }, "Személyes primerbeállítások"),
        ...SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.map((definicio, index) =>
          e(
            Text,
            {
              key: `beallitas-${definicio.kulcs}`,
              color:
                aktivPanel === "beallitasok" && index === kijeloltBeallitasIndex
                  ? "cyan"
                  : definicio.kulcs === "primarySource" &&
                      szerkesztoAdat.localSettings?.primarySource !== "default"
                    ? "green"
                    : definicio.kulcs === "modifiers.normalized" &&
                        szerkesztoAdat.localSettings?.modifiers?.normalized
                      ? "green"
                      : definicio.kulcs === "modifiers.ranking" &&
                          szerkesztoAdat.localSettings?.modifiers?.ranking
                        ? "green"
                        : undefined,
            },
            `${aktivPanel === "beallitasok" && index === kijeloltBeallitasIndex ? "❯ " : "  "}${
              definicio.cimke
            }: ${szemelyesBeallitasCimke(definicio, szerkesztoAdat.localSettings ?? {})}`
          )
        ),
        e(
          Text,
          { dimColor: true },
          aktualisBeallitasDefinicio
            ? szemelyesBeallitasLeiras(
                aktualisBeallitasDefinicio,
                szerkesztoAdat.localSettings ?? {}
              )
            : sajatPrimerForrasLeiras(szerkesztoAdat.localSettings?.primarySource ?? "default")
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
    )} • Normalizált: ${adat.localSettings?.modifiers?.normalized ? "be" : "ki"} • Rangsor: ${
      adat.localSettings?.modifiers?.ranking ? "be" : "ki"
    }`,
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
