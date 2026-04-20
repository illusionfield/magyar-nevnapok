/**
 * tui/index.mjs
 * Ink-alapú interaktív terminálfelület a pipeline-hoz, auditokhoz és az egységes primer audit workspace-hez.
 */

import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  allitIcsBeallitasokat,
  allitSajatPrimerBeallitasokat,
  betoltIcsBeallitasokat,
  betoltPrimerAuditAdata,
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  hozzaadHelyiPrimerKiegeszitest,
  pipelineAllapot,
  torolHelyiPrimerKiegeszitest,
  visszaallitIcsBeallitasokat,
} from "../index.mjs";
import { szerializalStrukturaltAdat } from "../kozos/strukturalt-fajl.mjs";
import {
  ICS_BEALLITAS_DEFINICIOK,
  epitIcsOutputProfilt,
  icsErtekCimke,
  normalizalIcsBeallitasokat,
} from "../domainek/naptar/ics-beallitasok.mjs";
import { PrimerAuditNezet } from "./primer-audit/index.mjs";

const e = React.createElement;

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
    leiras: "Hivatalos lista, primer-összevetések és az egységes primer audit frissítése.",
    vegrehajt: async () => ({ tipus: "audit", adat: await futtatAuditot("mind") }),
  },
  {
    azonosito: "primer-audit",
    cim: "Primer audit",
    leiras: "Audit-központú workspace a napi és név szerinti primer felülvizsgálathoz.",
    vegrehajt: async () => ({
      tipus: "primer-audit",
      adat: await betoltPrimerAuditAdata(),
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
          "A nevnapok kimenet general ics már kizárólag a mentett helyi YAML-profilt használja, és csak az aktív kimenet módhoz tartozó ICS-eket hagyja meg. A személyes primerforrás és a Normalizált / Rangsor módosítók a Primer audit nézet személyes beállítási drawerjében kezelhetők."
        )
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
    kezdoNezet === "primer-audit" || kezdoNezet === "ics"
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
          valasz.tipus === "primer-audit"
            ? "primer-audit"
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
    if (
      allapot === "primer-audit" ||
      allapot === "ics-beallitasok"
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
            valasz.tipus === "primer-audit"
              ? "primer-audit"
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

    if (allapot === "primer-audit") {
      return e(PrimerAuditNezet, {
        adat: eredmeny?.adat ?? eredmeny,
        visszaMenu: () => {
          setAllapot("menu");
          setEredmeny(null);
          setHiba(null);
        },
        szolgaltatasok: {
          allitSajatPrimerBeallitasokat,
          betoltPrimerAuditAdata,
          generalKimenetet,
          hozzaadHelyiPrimerKiegeszitest,
          torolHelyiPrimerKiegeszitest,
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
