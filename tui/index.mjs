// tui/index.mjs
// Egyszerű Ink-alapú varázsló és áttekintő JSX nélkül.

import React, { useMemo, useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  pipelineAllapot,
} from "../index.mjs";

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
    leiras: "A kanonikus adatbázisból újragenerálja az ICS kimenetet.",
    vegrehajt: async () => ({ tipus: "kimenet", adat: await generalKimenetet("ics") }),
  },
  {
    azonosito: "audit",
    cim: "Összes audit futtatása",
    leiras: "Hivatalos lista, primer-összevetések és végső riport.",
    vegrehajt: async () => ({ tipus: "audit", adat: await futtatAuditot("mind") }),
  },
  {
    azonosito: "kilepes",
    cim: "Kilépés",
    leiras: "Bezárja az interaktív felületet.",
    vegrehajt: async () => ({ tipus: "kilepes" }),
  },
];

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

function BetoltesNezet({ aktivPont }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Futtatás folyamatban"),
    e(Box, { marginTop: 1 }, e(Spinner, { label: `${aktivPont.cim}...` }))
  );
}

function HibaNezet({ hiba }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: "red", bold: true }, "Hiba történt"),
    e(Text, null, hiba?.message ?? String(hiba)),
    e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés")
  );
}

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

function EredmenyNezet({ aktivPont, eredmeny }) {
  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Sikeres művelet"),
    e(Text, null, aktivPont.cim),
    e(Text, { dimColor: true }, "Esc vagy v: vissza a menübe • q: kilépés"),
    e(Box, { marginTop: 1, flexDirection: "column" }, e(Text, null, JSON.stringify(eredmeny, null, 2)))
  );
}

function TuiAlkalmazas() {
  const { exit } = useApp();
  const [kijelolt, setKijelolt] = useState(0);
  const [allapot, setAllapot] = useState("menu");
  const [eredmeny, setEredmeny] = useState(null);
  const [hiba, setHiba] = useState(null);

  const aktivPont = menuPontok[kijelolt];

  useInput(async (input, key) => {
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
        setAllapot("betoltes");
        setHiba(null);

        try {
          const valasz = await aktivPont.vegrehajt();
          if (valasz.tipus === "kilepes") {
            exit();
            return;
          }
          setEredmeny(valasz);
          setAllapot("eredmeny");
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

    if (allapot === "eredmeny" && eredmeny?.tipus === "allapot") {
      return e(AllapotNezet, { sorok: eredmeny.adat });
    }

    return e(EredmenyNezet, { aktivPont, eredmeny: eredmeny?.adat ?? eredmeny });
  }, [aktivPont, allapot, eredmeny, hiba, kijelolt]);

  return e(Box, { padding: 1 }, nezet);
}

export async function futtatTui() {
  const app = render(e(TuiAlkalmazas));
  await app.waitUntilExit();
}
