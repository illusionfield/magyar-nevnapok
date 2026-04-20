/**
 * tui/primer-audit/index.mjs
 * Az új primer audit TUI-komponens vezérlése, állapotkezelése és mellékhatásai.
 */

import path from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { useApp, useInput, useStdout } from "ink";
import { PrimerAuditRender } from "./render.mjs";
import {
  SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK,
  buildPrimerAuditViewModel,
  leptetSzemelyesPrimerBeallitast,
  szemelyesBeallitasCimke,
} from "./view-model.mjs";
import {
  getSelectedDay,
  getSelectedPersonalEntry,
  reducePrimerAuditState,
  createPrimerAuditInitialState,
} from "./state.mjs";

function relativUtvonal(utvonal) {
  if (!utvonal) {
    return "—";
  }

  return path.relative(process.cwd(), utvonal) || path.basename(utvonal);
}

function frissitPrimerAuditHelyiKijelolest(adat, monthDay, name, selected) {
  let localSelectedCount = 0;
  let localSelectedDayCount = 0;

  const nextMonths = (adat.months ?? []).map((month) => ({
    ...month,
    rows: (month.rows ?? []).map((row) => {
      if (row.monthDay !== monthDay) {
        localSelectedCount += row.localSelectedCount ?? row.sections?.szemelyes?.selectedNames?.length ?? 0;
        localSelectedDayCount += (row.localSelectedCount ?? row.sections?.szemelyes?.selectedNames?.length ?? 0) > 0 ? 1 : 0;
        return row;
      }

      const nextPersonalEntries = (row.sections?.szemelyes?.entries ?? row.personalEntries ?? []).map((entry) =>
        entry.name === name
          ? {
              ...entry,
              localSelected: selected,
            }
          : entry
      );
      const nextCombinedMissing = (row.combinedMissing ?? []).map((entry) =>
        entry.name === name
          ? {
              ...entry,
              localSelected: selected,
            }
          : entry
      );
      const nextNormalizedMissing = (row.normalizedMissing ?? []).map((entry) =>
        entry.name === name
          ? {
              ...entry,
              localSelected: selected,
            }
          : entry
      );
      const nextRankingMissing = (row.rankingMissing ?? []).map((entry) =>
        entry.name === name
          ? {
              ...entry,
              localSelected: selected,
            }
          : entry
      );
      const localSelectedNames = nextPersonalEntries
        .filter((entry) => entry.localSelected === true)
        .map((entry) => entry.name);
      const localSelectedForRow = localSelectedNames.length;

      localSelectedCount += localSelectedForRow;
      localSelectedDayCount += localSelectedForRow > 0 ? 1 : 0;

      return {
        ...row,
        localSelectedNames,
        localSelectedCount: localSelectedForRow,
        combinedMissing: nextCombinedMissing,
        normalizedMissing: nextNormalizedMissing,
        rankingMissing: nextRankingMissing,
        personalEntries: nextPersonalEntries,
        sections: {
          ...(row.sections ?? {}),
          hianyzok: {
            ...(row.sections?.hianyzok ?? {}),
            combinedMissing: nextCombinedMissing,
            normalizedMissing: nextNormalizedMissing,
            rankingMissing: nextRankingMissing,
          },
          szemelyes: {
            ...(row.sections?.szemelyes ?? {}),
            selectedNames: localSelectedNames,
            entries: nextPersonalEntries,
          },
          osszefoglalo: {
            ...(row.sections?.osszefoglalo ?? {}),
            localSelectedCount: localSelectedForRow,
          },
        },
      };
    }),
  }));

  return {
    ...adat,
    summary: {
      ...(adat.summary ?? {}),
      localSelectedCount,
      localSelectedDayCount,
    },
    months: nextMonths,
  };
}

function frissitPrimerAuditSzemelyesBeallitasokat(adat, settings) {
  const nextMonths = (adat.months ?? []).map((month) => ({
    ...month,
    rows: (month.rows ?? []).map((row) => ({
      ...row,
      sections: {
        ...(row.sections ?? {}),
        szemelyes: {
          ...(row.sections?.szemelyes ?? {}),
          settingsSnapshot: settings,
        },
      },
    })),
  }));

  return {
    ...adat,
    personal: {
      ...(adat.personal ?? {}),
      settingsSnapshot: settings,
    },
    months: nextMonths,
  };
}

function modositSzemelyesBeallitast(settings, definicio, irany = 1) {
  return leptetSzemelyesPrimerBeallitast(settings, definicio, irany);
}

function hasSearchControlCharacter(input, key) {
  if (key.ctrl || key.meta) {
    return false;
  }

  return typeof input === "string" && input.length === 1 && !key.return && !key.tab;
}

export function PrimerAuditNezet({ adat, visszaMenu, szolgaltatasok }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [primerAuditAdat, setPrimerAuditAdat] = useState(adat);
  const viewModel = useMemo(() => buildPrimerAuditViewModel(primerAuditAdat), [primerAuditAdat]);
  const [allapot, setAllapot] = useState(() => createPrimerAuditInitialState(viewModel));
  const [folyamatban, setFolyamatban] = useState(false);
  const [uzenet, setUzenet] = useState("Primer audit betöltve.");
  const [uzenetTipus, setUzenetTipus] = useState("info");
  const [viewport, setViewport] = useState(() => ({
    columns: stdout?.columns ?? process.stdout.columns ?? 80,
    rows: stdout?.rows ?? process.stdout.rows ?? 24,
  }));

  const dispatch = (action) => {
    setAllapot((elozo) => reducePrimerAuditState(elozo, action, viewModel));
  };

  useEffect(() => {
    setPrimerAuditAdat(adat);
    const kovetkezoViewModel = buildPrimerAuditViewModel(adat);
    setAllapot(createPrimerAuditInitialState(kovetkezoViewModel));
    setUzenet("Primer audit betöltve.");
    setUzenetTipus("info");
  }, [adat]);

  useEffect(() => {
    setAllapot((elozo) => reducePrimerAuditState(elozo, { type: "sync" }, viewModel));
  }, [viewModel]);

  useEffect(() => {
    const frissitViewportot = () => {
      setViewport({
        columns: stdout?.columns ?? process.stdout.columns ?? 80,
        rows: stdout?.rows ?? process.stdout.rows ?? 24,
      });
    };

    frissitViewportot();

    if (!stdout?.on) {
      return undefined;
    }

    stdout.on("resize", frissitViewportot);

    return () => {
      if (stdout?.off) {
        stdout.off("resize", frissitViewportot);
        return;
      }

      if (stdout?.removeListener) {
        stdout.removeListener("resize", frissitViewportot);
      }
    };
  }, [stdout]);

  useInput(async (input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (folyamatban) {
      return;
    }

    if (allapot.search.aktiv) {
      if (key.return) {
        dispatch({ type: "confirm_search" });
        return;
      }

      if (key.escape) {
        dispatch({ type: "cancel_search" });
        return;
      }

      if (key.backspace || key.delete) {
        dispatch({ type: "backspace_search" });
        return;
      }

      if (hasSearchControlCharacter(input, key)) {
        dispatch({ type: "append_search", char: input });
      }
      return;
    }

    if (key.escape || input === "v") {
      if (allapot.helpOpen) {
        dispatch({ type: "toggle_help" });
        return;
      }

      if (allapot.settingsDrawerOpen) {
        dispatch({ type: "toggle_drawer" });
        return;
      }

      visszaMenu();
      return;
    }

    if (input === "?") {
      dispatch({ type: "toggle_help" });
      return;
    }

    if (allapot.helpOpen) {
      return;
    }

    if (key.tab) {
      dispatch({ type: "cycle_mode", irany: 1 });
      return;
    }

    if (["1", "2", "3"].includes(input)) {
      const modok = ["attekintes", "napok", "nevek"];
      dispatch({ type: "set_mode", mod: modok[Number(input) - 1] });
      return;
    }

    if (input === "b") {
      dispatch({ type: "toggle_drawer" });
      return;
    }

    if (allapot.settingsDrawerOpen) {
      if (key.upArrow) {
        dispatch({ type: "drawer_move", irany: -1 });
        return;
      }

      if (key.downArrow) {
        dispatch({ type: "drawer_move", irany: 1 });
        return;
      }

      if (key.leftArrow || key.rightArrow || input === " ") {
        const definicio = SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK[allapot.settingsIndex] ?? null;

        if (!definicio) {
          return;
        }

        const kovetkezo = modositSzemelyesBeallitast(
          viewModel.personalSettings ?? {},
          definicio,
          key.leftArrow ? -1 : 1
        );
        setFolyamatban(true);

        try {
          const eredmeny = await szolgaltatasok.allitSajatPrimerBeallitasokat(kovetkezo);
          setPrimerAuditAdat((elozo) => frissitPrimerAuditSzemelyesBeallitasokat(elozo, eredmeny.settings));
          setUzenetTipus("siker");
          setUzenet(
            `Személyes beállítás mentve: ${definicio.cimke} → ${szemelyesBeallitasCimke(
              definicio,
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

      return;
    }

    if (input === "/" && ["napok", "nevek"].includes(allapot.aktivMod)) {
      dispatch({ type: "start_search" });
      return;
    }

    if (input === "f") {
      dispatch({ type: "cycle_filter", irany: 1 });
      return;
    }

    if (input === "s") {
      dispatch({ type: "cycle_sort", irany: 1 });
      return;
    }

    if (input === "r") {
      setFolyamatban(true);

      try {
        const friss = await szolgaltatasok.betoltPrimerAuditAdata();
        setPrimerAuditAdat(friss);
        setUzenetTipus("info");
        setUzenet("A primer audit friss riporttal újratöltve.");
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
        const utvonalak = await szolgaltatasok.generalKimenetet("ics");
        setUzenetTipus("siker");
        setUzenet(`ICS generálás kész: ${utvonalak.map((utvonal) => relativUtvonal(utvonal)).join(", ")}`);
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
      return;
    }

    if (key.leftArrow || key.rightArrow) {
      if (allapot.aktivMod === "attekintes") {
        dispatch({ type: "move", irany: key.leftArrow ? -1 : 1 });
        return;
      }

      dispatch({ type: "toggle_panel" });
      return;
    }

    if (key.upArrow) {
      dispatch({ type: "move", irany: -1 });
      return;
    }

    if (key.downArrow) {
      dispatch({ type: "move", irany: 1 });
      return;
    }

    if (key.return) {
      dispatch({ type: "activate_enter" });
      return;
    }

    if (input === " " && allapot.aktivMod === "napok" && allapot.dayPanel === "szemelyes") {
      const day = getSelectedDay(viewModel, allapot);
      const personalEntry = getSelectedPersonalEntry(viewModel, allapot);

      if (!day || !personalEntry || personalEntry.localSelectable === false) {
        return;
      }

      setFolyamatban(true);
      try {
        const eredmeny = personalEntry.localSelected
          ? await szolgaltatasok.torolHelyiPrimerKiegeszitest({
              monthDay: day.monthDay,
              name: personalEntry.name,
            })
          : await szolgaltatasok.hozzaadHelyiPrimerKiegeszitest({
              monthDay: day.monthDay,
              name: personalEntry.name,
            });

        setPrimerAuditAdat((elozo) =>
          frissitPrimerAuditHelyiKijelolest(elozo, day.monthDay, personalEntry.name, eredmeny.selected)
        );
        setUzenetTipus("siker");
        setUzenet(
          eredmeny.selected
            ? `Hozzáadva a személyes primerhez: ${day.monthDay} / ${personalEntry.name}`
            : `Eltávolítva a személyes primerből: ${day.monthDay} / ${personalEntry.name}`
        );
      } catch (error) {
        setUzenetTipus("hiba");
        setUzenet(error?.message ?? String(error));
      } finally {
        setFolyamatban(false);
      }
    }
  });

  return React.createElement(PrimerAuditRender, {
    viewModel,
    state: allapot,
    folyamatban,
    uzenet,
    uzenetTipus,
    viewport,
  });
}
