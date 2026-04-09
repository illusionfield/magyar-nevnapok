// index.mjs
// A projekt kanonikus belépési pontja és publikus API-ja.

export {
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  listazAuditokat,
  listazKimenetiFormatumokat,
  listazPipelineCelLista,
  pipelineAllapot,
  torolGoogleNaptarat,
} from "./domainek/szolgaltatasok.mjs";

export { artifactumTar } from "./pipeline/artifactumok.mjs";
export { pipelineLepesek } from "./pipeline/lepesek.mjs";
export { kanonikusUtvonalak } from "./kozos/utvonalak.mjs";
