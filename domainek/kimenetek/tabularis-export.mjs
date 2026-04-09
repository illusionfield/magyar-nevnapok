/**
 * domainek/kimenetek/tabularis-export.mjs
 * Táblázatos CSV- és Excel-export az elsődleges névadatbázisból.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { letrehozSzuloKonyvtarat } from "../../kozos/fajlrendszer.mjs";
import { betoltStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const CSV_ELVALASZTO = ";";
const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_CSV_OUTPUT_PATH = kanonikusUtvonalak.exportok.csv;
const DEFAULT_EXCEL_OUTPUT_PATH = kanonikusUtvonalak.exportok.excel;
const MAX_EXCEL_MUNKALAP_NEV_HOSSZ = 31;

const OSZLOPOK = [
  { kulcs: "nev", cim: "Név" },
  { kulcs: "nem", cim: "Nem" },
  { kulcs: "honap", cim: "Hónap" },
  { kulcs: "nap", cim: "Nap" },
  { kulcs: "datum", cim: "Dátum" },
  { kulcs: "elsoleges", cim: "Elsődleges" },
  { kulcs: "primerJegyzek", cim: "Primerjegyzék" },
  { kulcs: "legacyElsoleges", cim: "Legacy elsődleges" },
  { kulcs: "rangsoroltElsoleges", cim: "Rangsorolt elsődleges" },
  { kulcs: "jegyzekSorrend", cim: "Jegyzéksorrend" },
  { kulcs: "legacySorrend", cim: "Legacy sorrend" },
  { kulcs: "rangsor", cim: "Rangsor" },
  { kulcs: "gyakorisag", cim: "Gyakoriság" },
  { kulcs: "gyakorisagPont", cim: "Gyakorisági pont" },
  { kulcs: "gyakorisagKod", cim: "Gyakorisági kód" },
  { kulcs: "eredet", cim: "Eredet" },
  { kulcs: "jelentes", cim: "Jelentés" },
  { kulcs: "becenevek", cim: "Becenevek" },
  { kulcs: "kapcsolodoNevek", cim: "Kapcsolódó nevek" },
  { kulcs: "nyelviJellemzok", cim: "Nyelvi jellemzők" },
  { kulcs: "formalizalt", cim: "Formalizált alak" },
  { kulcs: "reszletekUrl", cim: "Részletek URL" },
];

/**
 * Az `exportalCsv` egyetlen, lapos CSV-t készít a névnap-hozzárendelésekből.
 */
export async function exportalCsv(opciok = {}) {
  const adatbazis = await betoltNevnapAdatbazist(opciok);
  const cel = path.resolve(process.cwd(), opciok.output ?? DEFAULT_CSV_OUTPUT_PATH);
  const sorok = epitLapositottSorokat(adatbazis);
  const csv = szerializalCsv(OSZLOPOK, sorok);

  await letrehozSzuloKonyvtarat(cel);
  await fs.writeFile(cel, csv, "utf8");

  return [cel];
}

/**
 * Az `exportalExcel` több munkalapos `.xlsx` fájlt készít ugyanabból az adatbázisból.
 */
export async function exportalExcel(opciok = {}) {
  const adatbazis = await betoltNevnapAdatbazist(opciok);
  const cel = path.resolve(process.cwd(), opciok.output ?? DEFAULT_EXCEL_OUTPUT_PATH);
  const nevekSorai = epitLapositottSorokat(adatbazis);
  const napokSorai = epitNapiOsszegzoSorokat(adatbazis);
  const metaSorai = epitMetaSorokat(adatbazis, nevekSorai, napokSorai);
  const munkafuzet = epitXlsxMunkafuzet([
    {
      nev: "Nevnapok",
      fejléc: OSZLOPOK.map((oszlop) => oszlop.cim),
      sorok: nevekSorai.map((sor) => OSZLOPOK.map((oszlop) => sor[oszlop.kulcs] ?? "")),
    },
    {
      nev: "Napok",
      fejléc: [
        "Hónap",
        "Nap",
        "Dátum",
        "Nevek",
        "Névdarab",
        "Elsődleges nevek",
        "Elsődleges darab",
        "Primerjegyzék",
        "Legacy elsődleges",
        "Rangsorolt elsődleges",
      ],
      sorok: napokSorai.map((sor) => [
        sor.honap,
        sor.nap,
        sor.datum,
        sor.nevek,
        sor.nevDarab,
        sor.elsolegesNevek,
        sor.elsolegesDarab,
        sor.primerJegyzekNevek,
        sor.legacyElsolegesNevek,
        sor.rangsoroltElsolegesNevek,
      ]),
    },
    {
      nev: "Meta",
      fejléc: ["Kulcs", "Érték"],
      sorok: metaSorai.map((sor) => [sor.kulcs, sor.ertek]),
    },
  ]);

  await letrehozSzuloKonyvtarat(cel);
  await fs.writeFile(cel, munkafuzet);

  return [cel];
}

/**
 * A `betoltNevnapAdatbazist` beolvassa az elsődleges névadatbázist.
 */
async function betoltNevnapAdatbazist(opciok = {}) {
  const input = path.resolve(process.cwd(), opciok.input ?? DEFAULT_INPUT_PATH);
  return betoltStrukturaltFajl(input);
}

/**
 * Az `epitLapositottSorokat` név + nap alapú, táblázatos rekordokká lapítja az adatbázist.
 */
function epitLapositottSorokat(adatbazis) {
  const sorok = [];
  const rendezettNevek = [...(adatbazis.names ?? [])].sort((bal, jobb) =>
    collator.compare(bal.name ?? "", jobb.name ?? "")
  );

  for (const nevRekord of rendezettNevek) {
    const napok = [...(nevRekord.days ?? [])].sort(rendezdNapokat);

    if (napok.length === 0) {
      sorok.push(epitLapositottSort(nevRekord, null));
      continue;
    }

    for (const napRekord of napok) {
      sorok.push(epitLapositottSort(nevRekord, napRekord));
    }
  }

  return sorok;
}

/**
 * Az `epitLapositottSort` egyetlen táblázatos sort készít.
 */
function epitLapositottSort(nevRekord, napRekord) {
  return {
    nev: nevRekord.name ?? "",
    nem: nevRekord.gender ?? "",
    honap: napRekord?.month ?? "",
    nap: napRekord?.day ?? "",
    datum: napRekord?.monthDay ?? "",
    elsoleges: formatalLogikaiErteket(napRekord?.primary),
    primerJegyzek: formatalLogikaiErteket(napRekord?.primaryRegistry),
    legacyElsoleges: formatalLogikaiErteket(napRekord?.primaryLegacy),
    rangsoroltElsoleges: formatalLogikaiErteket(napRekord?.primaryRanked),
    jegyzekSorrend: napRekord?.registryOrder ?? "",
    legacySorrend: napRekord?.legacyOrder ?? "",
    rangsor: formatalRangsor(napRekord?.ranking),
    gyakorisag: nevRekord.frequency?.labelHu ?? "",
    gyakorisagPont: nevRekord.frequency?.rank ?? "",
    gyakorisagKod: nevRekord.frequency?.tag ?? "",
    eredet: nevRekord.origin ?? "",
    jelentes: nevRekord.meaning ?? "",
    becenevek: listaSzovegge(nevRekord.nicknames),
    kapcsolodoNevek: listaSzovegge(nevRekord.relatedNames),
    nyelviJellemzok: formatalNyelviJellemzok(nevRekord.languageFeatures),
    formalizalt: formatalFormalizalt(nevRekord.formalized),
    reszletekUrl: nevRekord.detailUrl ?? "",
  };
}

/**
 * Az `epitNapiOsszegzoSorokat` nap alapú összesítést készít az Excel `Napok` munkalapjához.
 */
function epitNapiOsszegzoSorokat(adatbazis) {
  const napTar = new Map();

  for (const nevRekord of adatbazis.names ?? []) {
    for (const napRekord of nevRekord.days ?? []) {
      const kulcs = napRekord.monthDay ?? `${String(napRekord.month ?? "").padStart(2, "0")}-${String(
        napRekord.day ?? ""
      ).padStart(2, "0")}`;

      if (!napTar.has(kulcs)) {
        napTar.set(kulcs, {
          honap: napRekord.month ?? "",
          nap: napRekord.day ?? "",
          datum: kulcs,
          nevek: [],
          elsolegesNevek: [],
          primerJegyzekNevek: [],
          legacyElsolegesNevek: [],
          rangsoroltElsolegesNevek: [],
        });
      }

      const sor = napTar.get(kulcs);
      sor.nevek.push(nevRekord.name ?? "");

      if (napRekord.primary) {
        sor.elsolegesNevek.push(nevRekord.name ?? "");
      }

      if (napRekord.primaryRegistry) {
        sor.primerJegyzekNevek.push(nevRekord.name ?? "");
      }

      if (napRekord.primaryLegacy) {
        sor.legacyElsolegesNevek.push(nevRekord.name ?? "");
      }

      if (napRekord.primaryRanked) {
        sor.rangsoroltElsolegesNevek.push(nevRekord.name ?? "");
      }
    }
  }

  return Array.from(napTar.values())
    .sort((bal, jobb) => {
      if (bal.honap !== jobb.honap) {
        return Number(bal.honap) - Number(jobb.honap);
      }

      return Number(bal.nap) - Number(jobb.nap);
    })
    .map((sor) => ({
      ...sor,
      nevek: listaSzovegge(sor.nevek.sort((bal, jobb) => collator.compare(bal, jobb))),
      nevDarab: sor.nevek.length,
      elsolegesNevek: listaSzovegge(
        sor.elsolegesNevek.sort((bal, jobb) => collator.compare(bal, jobb))
      ),
      elsolegesDarab: sor.elsolegesNevek.length,
      primerJegyzekNevek: listaSzovegge(
        sor.primerJegyzekNevek.sort((bal, jobb) => collator.compare(bal, jobb))
      ),
      legacyElsolegesNevek: listaSzovegge(
        sor.legacyElsolegesNevek.sort((bal, jobb) => collator.compare(bal, jobb))
      ),
      rangsoroltElsolegesNevek: listaSzovegge(
        sor.rangsoroltElsolegesNevek.sort((bal, jobb) => collator.compare(bal, jobb))
      ),
    }));
}

/**
 * Az `epitMetaSorokat` rövid metaösszegzést készít az Excel `Meta` munkalapjához.
 */
function epitMetaSorokat(adatbazis, nevekSorai, napokSorai) {
  const napHozzarendelesDarab = nevekSorai.filter((sor) => sor.datum).length;
  const elsolegesDarab = nevekSorai.filter((sor) => sor.elsoleges === "igen").length;
  const primerJegyzekDarab = nevekSorai.filter((sor) => sor.primerJegyzek === "igen").length;
  const legacyDarab = nevekSorai.filter((sor) => sor.legacyElsoleges === "igen").length;
  const rangsoroltDarab = nevekSorai.filter((sor) => sor.rangsoroltElsoleges === "igen").length;

  return [
    { kulcs: "Verzió", ertek: adatbazis.version ?? "" },
    { kulcs: "Generálva", ertek: adatbazis.generatedAt ?? "" },
    { kulcs: "Forrás", ertek: adatbazis.source?.provider ?? "" },
    { kulcs: "Névrekordok száma", ertek: adatbazis.stats?.nameCount ?? (adatbazis.names ?? []).length },
    { kulcs: "Nap-hozzárendelések száma", ertek: napHozzarendelesDarab },
    { kulcs: "Külön napok száma", ertek: napokSorai.length },
    { kulcs: "Elsődleges nap-hozzárendelések", ertek: elsolegesDarab },
    { kulcs: "Primerjegyzék szerinti elsődlegesek", ertek: primerJegyzekDarab },
    { kulcs: "Legacy elsődlegesek", ertek: legacyDarab },
    { kulcs: "Rangsorolt elsődlegesek", ertek: rangsoroltDarab },
  ];
}

/**
 * A `szerializalCsv` UTF-8 BOM-os, pontosvesszővel tagolt CSV-t készít.
 *
 * A BOM azért kell, hogy a magyar ékezetek Excelben megnyitva is jól jelenjenek meg.
 */
function szerializalCsv(oszlopok, sorok) {
  const fejlec = oszlopok.map((oszlop) => csvCellaba(oszlop.cim)).join(CSV_ELVALASZTO);
  const tartalom = sorok
    .map((sor) =>
      oszlopok.map((oszlop) => csvCellaba(sor[oszlop.kulcs] ?? "")).join(CSV_ELVALASZTO)
    )
    .join("\n");

  return `\uFEFF${fejlec}\n${tartalom}\n`;
}

/**
 * A `csvCellaba` gondoskodik a CSV-escape-elésről.
 */
function csvCellaba(ertek) {
  const szoveg = String(ertek ?? "");

  if (!/[";\n\r]/u.test(szoveg)) {
    return szoveg;
  }

  return `"${szoveg.replaceAll('"', '""')}"`;
}

/**
 * Az `epitXlsxMunkafuzet` minimális, de szabványos `.xlsx` fájlt készít.
 *
 * Külső production dependency helyett saját, tárolt ZIP-írást használunk, hogy a
 * projekt futásidejű lábnyoma kicsi maradjon, és az export továbbra is egyetlen
 * Node.js CLI-ből működjön.
 */
function epitXlsxMunkafuzet(munkalapok) {
  const rendezettMunkalapok = munkalapok.map((munkalap, index) => ({
    ...munkalap,
    azonosito: index + 1,
    nev: normalizalExcelMunkalapNevet(munkalap.nev || `Lap${index + 1}`),
  }));

  const fajlok = [
    { nev: "[Content_Types].xml", adat: bufferbol(epitContentTypesXml(rendezettMunkalapok.length)) },
    { nev: "_rels/.rels", adat: bufferbol(epitGyokerKapcsolatokXml()) },
    { nev: "xl/workbook.xml", adat: bufferbol(epitWorkbookXml(rendezettMunkalapok)) },
    { nev: "xl/_rels/workbook.xml.rels", adat: bufferbol(epitWorkbookKapcsolatokXml(rendezettMunkalapok.length)) },
    { nev: "xl/styles.xml", adat: bufferbol(epitStylesXml()) },
    ...rendezettMunkalapok.map((munkalap, index) => ({
      nev: `xl/worksheets/sheet${index + 1}.xml`,
      adat: bufferbol(epitWorksheetXml(munkalap.fejlec, munkalap.sorok)),
    })),
  ];

  return zipTaroltFajlokkal(fajlok);
}

/**
 * A `epitContentTypesXml` elkészíti a munkafüzet tartalomtípus-leíróját.
 */
function epitContentTypesXml(munkalapDarab) {
  const munkalapBejegyzesek = Array.from({ length: munkalapDarab }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    munkalapBejegyzesek,
    "</Types>",
  ].join("");
}

/**
 * A `epitGyokerKapcsolatokXml` a csomag gyökérkapcsolatait adja vissza.
 */
function epitGyokerKapcsolatokXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>",
  ].join("");
}

/**
 * A `epitWorkbookXml` felépíti a munkafüzet fő XML-jét.
 */
function epitWorkbookXml(munkalapok) {
  const lapok = munkalapok
    .map(
      (munkalap) =>
        `<sheet name="${xmlAttribrumban(munkalap.nev)}" sheetId="${munkalap.azonosito}" r:id="rId${munkalap.azonosito}"/>`
    )
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets>${lapok}</sheets>`,
    "</workbook>",
  ].join("");
}

/**
 * A `epitWorkbookKapcsolatokXml` felépíti a munkafüzet belső kapcsolatlistáját.
 */
function epitWorkbookKapcsolatokXml(munkalapDarab) {
  const munkalapKapcsolatok = Array.from({ length: munkalapDarab }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    munkalapKapcsolatok,
    `<Relationship Id="rId${munkalapDarab + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    "</Relationships>",
  ].join("");
}

/**
 * A `epitStylesXml` minimális stílusdefiníciót ad az Excelnek.
 */
function epitStylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>',
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    "</styleSheet>",
  ].join("");
}

/**
 * A `epitWorksheetXml` egyetlen munkalap XML-jét állítja elő.
 */
function epitWorksheetXml(fejlec = [], sorok = []) {
  const teljesSorok = [fejlec, ...sorok];
  const sheetRows = teljesSorok
    .map((sor, sorIndex) => {
      const cellak = sor
        .map((ertek, oszlopIndex) => epitCellaXml(ertek, sorIndex + 1, oszlopIndex + 1))
        .join("");

      return `<row r="${sorIndex + 1}">${cellak}</row>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${sheetRows}</sheetData>`,
    "</worksheet>",
  ].join("");
}

/**
 * Az `epitCellaXml` a megadott értékből egyetlen cellát készít.
 */
function epitCellaXml(ertek, sorIndex, oszlopIndex) {
  const hivatkozas = `${excelOszlopNev(oszlopIndex)}${sorIndex}`;

  if (ertek === null || ertek === undefined || ertek === "") {
    return `<c r="${hivatkozas}"/>`;
  }

  if (typeof ertek === "number" && Number.isFinite(ertek)) {
    return `<c r="${hivatkozas}"><v>${ertek}</v></c>`;
  }

  if (typeof ertek === "boolean") {
    return `<c r="${hivatkozas}" t="b"><v>${ertek ? 1 : 0}</v></c>`;
  }

  return `<c r="${hivatkozas}" t="inlineStr"><is><t xml:space="preserve">${xmlSzovegben(String(ertek))}</t></is></c>`;
}

/**
 * A `zipTaroltFajlokkal` tömörítés nélküli ZIP-et épít.
 */
function zipTaroltFajlokkal(fajlok) {
  const lokalok = [];
  const centralDirectory = [];
  let eltolás = 0;

  for (const fajl of fajlok) {
    const nevBuffer = Buffer.from(fajl.nev, "utf8");
    const adatBuffer = fajl.adat;
    const crc = crc32(adatBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc >>> 0, 14);
    localHeader.writeUInt32LE(adatBuffer.length, 18);
    localHeader.writeUInt32LE(adatBuffer.length, 22);
    localHeader.writeUInt16LE(nevBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, nevBuffer, adatBuffer]);
    lokalok.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc >>> 0, 16);
    centralHeader.writeUInt32LE(adatBuffer.length, 20);
    centralHeader.writeUInt32LE(adatBuffer.length, 24);
    centralHeader.writeUInt16LE(nevBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(eltolás, 42);

    centralDirectory.push(Buffer.concat([centralHeader, nevBuffer]));
    eltolás += localRecord.length;
  }

  const centralBuffer = Buffer.concat(centralDirectory);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(fajlok.length, 8);
  endRecord.writeUInt16LE(fajlok.length, 10);
  endRecord.writeUInt32LE(centralBuffer.length, 12);
  endRecord.writeUInt32LE(eltolás, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...lokalok, centralBuffer, endRecord]);
}

/**
 * A `crc32` a ZIP-csomagoláshoz szükséges CRC32 ellenőrzőösszeget számolja.
 */
function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC32_TABLA[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Az `excelOszlopNev` oszlopszámból Excel-oszlopazonosítót készít.
 */
function excelOszlopNev(index) {
  let maradek = index;
  let eredmeny = "";

  while (maradek > 0) {
    const aktualis = (maradek - 1) % 26;
    eredmeny = String.fromCharCode(65 + aktualis) + eredmeny;
    maradek = Math.floor((maradek - 1) / 26);
  }

  return eredmeny;
}

/**
 * A `normalizalExcelMunkalapNevet` Excel-kompatibilis névvé alakítja a lap nevét.
 */
function normalizalExcelMunkalapNevet(nev) {
  return String(nev)
    .replace(/[[\]:*?/\\]/gu, "-")
    .slice(0, MAX_EXCEL_MUNKALAP_NEV_HOSSZ) || "Lap";
}

/**
 * A `rendezdNapokat` hónap-nap szerint rendez.
 */
function rendezdNapokat(bal, jobb) {
  if ((bal?.month ?? 0) !== (jobb?.month ?? 0)) {
    return (bal?.month ?? 0) - (jobb?.month ?? 0);
  }

  return (bal?.day ?? 0) - (jobb?.day ?? 0);
}

/**
 * A `formatalLogikaiErteket` emberi olvasható logikai cellaértéket ad.
 */
function formatalLogikaiErteket(ertek) {
  if (ertek === true) {
    return "igen";
  }

  if (ertek === false) {
    return "nem";
  }

  return "";
}

/**
 * A `listaSzovegge` tömböt rövid, emberi olvasható szöveggé alakít.
 */
function listaSzovegge(ertekek) {
  if (!Array.isArray(ertekek) || ertekek.length === 0) {
    return "";
  }

  return ertekek.filter(Boolean).join(" | ");
}

/**
 * A `formatalNyelviJellemzok` a nyelvi jellemzőket egyetlen cellába rendezi.
 */
function formatalNyelviJellemzok(jellemzok) {
  if (!Array.isArray(jellemzok) || jellemzok.length === 0) {
    return "";
  }

  return jellemzok
    .map((jellemzo) => {
      if (!jellemzo || typeof jellemzo !== "object") {
        return String(jellemzo ?? "");
      }

      const cimke = jellemzo.labelHu ?? jellemzo.label ?? jellemzo.tag ?? "";
      const ertek = jellemzo.valueHu ?? jellemzo.value ?? "";
      return [cimke, ertek].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join(" | ");
}

/**
 * A `formatalFormalizalt` a formalizált szerkezetből rövid, olvasható szöveget készít.
 */
function formatalFormalizalt(formalizalt) {
  if (!formalizalt) {
    return "";
  }

  if (typeof formalizalt === "string") {
    return formalizalt;
  }

  if (typeof formalizalt === "object") {
    return formalizalt.normalized ?? formalizalt.raw ?? JSON.stringify(formalizalt);
  }

  return String(formalizalt);
}

/**
 * A `formatalRangsor` az összetett ranking objektumból rövid cellaszöveget készít.
 */
function formatalRangsor(ranking) {
  if (!ranking) {
    return "";
  }

  if (typeof ranking !== "object") {
    return String(ranking);
  }

  const reszek = [];

  if (Number.isFinite(ranking.score)) {
    reszek.push(`pontszám: ${ranking.score}`);
  }

  if (Number.isFinite(ranking.overallRank)) {
    reszek.push(`teljes: ${ranking.overallRank}`);
  }

  if (Number.isFinite(ranking.newbornRank)) {
    reszek.push(`újszülött: ${ranking.newbornRank}`);
  }

  if (Number.isFinite(ranking.dayOrder)) {
    reszek.push(`napi: ${ranking.dayOrder}`);
  }

  return reszek.length > 0 ? reszek.join(" | ") : JSON.stringify(ranking);
}

/**
 * Az `xmlSzovegben` XML-szövegként biztonságos tartalmat ad vissza.
 */
function xmlSzovegben(ertek) {
  return tisztitXmlSzoveget(ertek)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Az `xmlAttribrumban` XML-attribútumba biztonságos tartalmat ad vissza.
 */
function xmlAttribrumban(ertek) {
  return xmlSzovegben(ertek)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * A `tisztitXmlSzoveget` kiszedi az XML-ben tiltott vezérlőkaraktereket.
 */
function tisztitXmlSzoveget(ertek) {
  return String(ertek).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/gu, "");
}

/**
 * A `bufferbol` UTF-8 Bufferre alakítja a megadott szöveget.
 */
function bufferbol(szoveg) {
  return Buffer.from(szoveg, "utf8");
}

const CRC32_TABLA = (() => {
  const tabla = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let ertek = index;

    for (let bit = 0; bit < 8; bit += 1) {
      ertek = (ertek & 1) === 1 ? (0xedb88320 ^ (ertek >>> 1)) : (ertek >>> 1);
    }

    tabla[index] = ertek >>> 0;
  }

  return tabla;
})();
