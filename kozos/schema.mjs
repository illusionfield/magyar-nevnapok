// kozos/schema.mjs
// Ajv alapú sémavalidálás a kanonikus artifactokhoz.

import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

export function letrehozValidator(schema) {
  return ajv.compile(schema);
}

export function ervenyesitSchema(validator, adat, cimke) {
  const sikeres = validator(adat);

  if (sikeres) {
    return true;
  }

  const hibak = (validator.errors ?? [])
    .map((hiba) => `${hiba.instancePath || "/"} ${hiba.message}`)
    .join("; ");

  throw new Error(`Érvénytelen ${cimke}: ${hibak}`);
}
