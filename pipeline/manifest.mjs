// pipeline/manifest.mjs
// A pipeline futási állapotának olvasása és frissítése.

import { artifactumTar } from "./artifactumok.mjs";
import { letezik, sha256Fajl, fajlMeret } from "../kozos/fajlrendszer.mjs";

export async function betoltManifest() {
  const utvonal = artifactumTar.pipelineManifest.alapertelmezettUtvonal;

  if (!(await letezik(utvonal))) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      steps: [],
    };
  }

  return artifactumTar.pipelineManifest.betolt();
}

export async function rogzitManifestLepes({ stepId, status, inputs, outputs, durationMs, error }) {
  const manifest = await betoltManifest();
  const generatedAt = new Date().toISOString();

  let checksum = null;
  let sizeBytes = null;

  if (Array.isArray(outputs) && outputs.length > 0) {
    const utolso = outputs[outputs.length - 1];
    if (utolso) {
      try {
        checksum = await sha256Fajl(utolso);
        sizeBytes = await fajlMeret(utolso);
      } catch {
        checksum = null;
        sizeBytes = null;
      }
    }
  }

  const lep = {
    stepId,
    generatedAt,
    status,
    inputs,
    outputs,
    durationMs: durationMs ?? null,
    checksum,
    sizeBytes,
    error: error ?? null,
  };

  manifest.generatedAt = generatedAt;
  manifest.steps = [...manifest.steps.filter((elem) => elem.stepId !== stepId), lep];

  await artifactumTar.pipelineManifest.ment(manifest);
  return manifest;
}
