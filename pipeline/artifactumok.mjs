// pipeline/artifactumok.mjs
// A kanonikus artifactok leírása, betöltése, mentése és alapvalidációja.

import { letrehozValidator, ervenyesitSchema } from "../kozos/schema.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";

const kozosListaSchema = {
  type: "array",
  items: { type: "string" },
};

function letrehozSpecifikacio({ azonosito, verzio, alapertelmezettUtvonal, schema }) {
  const validator = letrehozValidator(schema);

  return {
    azonosito,
    verzio,
    alapertelmezettUtvonal,
    async betolt(utvonal = alapertelmezettUtvonal) {
      const adat = await betoltStrukturaltFajl(utvonal);
      ervenyesitSchema(validator, adat, azonosito);
      return adat;
    },
    async ment(adat, utvonal = alapertelmezettUtvonal, formatum = null) {
      ervenyesitSchema(validator, adat, azonosito);
      await mentStrukturaltFajl(utvonal, adat, formatum);
    },
    ervenyesit(adat) {
      ervenyesitSchema(validator, adat, azonosito);
    },
  };
}

const primerNapSchema = {
  type: "object",
  required: ["version", "generatedAt", "days"],
  properties: {
    version: { type: "integer" },
    generatedAt: { type: "string" },
    sourceFile: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    inputs: { type: ["object", "null"] },
    stats: { type: ["object", "null"] },
    days: {
      type: "array",
      items: {
        type: "object",
        required: ["month", "day", "monthDay", "names", "preferredNames"],
        properties: {
          month: { type: "integer" },
          day: { type: "integer" },
          monthDay: { type: "string" },
          names: kozosListaSchema,
          preferredNames: kozosListaSchema,
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
};

const nevadatbazisSchema = {
  type: "object",
  required: ["version", "generatedAt", "names"],
  properties: {
    version: { type: "integer" },
    generatedAt: { type: "string" },
    source: { type: ["object", "null"] },
    stats: { type: ["object", "null"] },
    names: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "days"],
        properties: {
          name: { type: "string" },
          detailUrl: { type: ["string", "null"] },
          gender: { type: ["string", "null"] },
          days: {
            type: "array",
            items: {
              type: "object",
              required: ["month", "day", "monthDay"],
              properties: {
                month: { type: "integer" },
                day: { type: "integer" },
                monthDay: { type: "string" },
              },
              additionalProperties: true,
            },
          },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
};

const eleKimenetSchema = {
  type: "object",
  required: ["version", "generatedAt", "edges"],
  properties: {
    version: { type: "integer" },
    generatedAt: { type: "string" },
    source: { type: ["object", "null"] },
    edges: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
  },
  additionalProperties: true,
};

const riportSchema = {
  type: "object",
  required: ["generatedAt"],
  properties: {
    generatedAt: { type: "string" },
  },
  additionalProperties: true,
};

const pipelineManifestSchema = {
  type: "object",
  required: ["version", "generatedAt", "steps"],
  properties: {
    version: { type: "integer" },
    generatedAt: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["stepId", "generatedAt", "status", "inputs", "outputs"],
        properties: {
          stepId: { type: "string" },
          generatedAt: { type: "string" },
          durationMs: { type: ["integer", "null"] },
          status: { type: "string" },
          inputs: { type: "array", items: { type: "string" } },
          outputs: { type: "array", items: { type: "string" } },
          checksum: { type: ["string", "null"] },
          sizeBytes: { type: ["integer", "null"] },
          error: { type: ["string", "null"] },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
};

export const artifactumTar = {
  legacyPrimer: letrehozSpecifikacio({
    azonosito: "legacy-primer",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.primer.legacy,
    schema: primerNapSchema,
  }),
  wikiPrimer: letrehozSpecifikacio({
    azonosito: "wiki-primer",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.primer.wiki,
    schema: primerNapSchema,
  }),
  vegsoPrimer: letrehozSpecifikacio({
    azonosito: "vegso-primer",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.primer.vegso,
    schema: primerNapSchema,
  }),
  normalizaloRiport: letrehozSpecifikacio({
    azonosito: "normalizalo-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.primer.normalizaloRiport,
    schema: riportSchema,
  }),
  nevadatbazis: letrehozSpecifikacio({
    azonosito: "nevadatbazis",
    verzio: 6,
    alapertelmezettUtvonal: kanonikusUtvonalak.adatbazis.nevnapok,
    schema: nevadatbazisSchema,
  }),
  formalizaltElek: letrehozSpecifikacio({
    azonosito: "formalizalt-elek",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.adatbazis.formalizaltElek,
    schema: eleKimenetSchema,
  }),
  legacyPrimerRiport: letrehozSpecifikacio({
    azonosito: "legacy-primer-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.riportok.legacyPrimer,
    schema: riportSchema,
  }),
  wikiVsLegacyRiport: letrehozSpecifikacio({
    azonosito: "wiki-vs-legacy-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.riportok.wikiVsLegacy,
    schema: riportSchema,
  }),
  primerNormalizaloRiport: letrehozSpecifikacio({
    azonosito: "primer-normalizalo-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.riportok.primerNormalizalo,
    schema: riportSchema,
  }),
  vegsoPrimerRiport: letrehozSpecifikacio({
    azonosito: "vegso-primer-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.riportok.vegsoPrimer,
    schema: riportSchema,
  }),
  hivatalosNevjegyzekRiport: letrehozSpecifikacio({
    azonosito: "hivatalos-nevjegyzek-riport",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
    schema: riportSchema,
  }),
  pipelineManifest: letrehozSpecifikacio({
    azonosito: "pipeline-manifest",
    verzio: 1,
    alapertelmezettUtvonal: kanonikusUtvonalak.pipeline.manifest,
    schema: pipelineManifestSchema,
  }),
};

