/**
 * kozos/schema.mjs
 * Ajv alapú sémavalidálás az elsődleges artifactokhoz.
 */

import Ajv from "ajv";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

/**
 * A `letrehozValidator` Ajv-validátort fordít a megadott sémából.
 */
export function letrehozValidator(schema) {
  return ajv.compile(schema);
}

/**
 * Az `ervenyesitSchema` hibával leáll, ha az adat nem felel meg a sémának.
 */
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
