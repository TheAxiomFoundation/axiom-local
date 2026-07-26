/**
 * The "change the law" moment: patch a statutory parameter inside the
 * compiled artifact and re-run — in this tab, like everything else.
 *
 * The artifact is data. A parameter rule carries its values as dated
 * versions; amending the law for a what-if is a JSON edit followed by
 * re-execution. The original artifact string is never mutated, so restoring
 * current law is just running the original again.
 */

import type { CompiledProgramArtifact } from "./engine/types";

export interface WhatIfEdit {
  /** The parameter rule's name, e.g. "snap_earned_income_deduction_rate_for_net_income". */
  parameter: string;
  /** The replacement value, applied to every version and every table entry. */
  value: string;
}

export interface WhatIfResult {
  artifactJson: string;
  /** Durable id of the amended parameter, for the citation line. */
  parameterId: string;
  /** The value current law carries (from the latest version, first entry). */
  previousValue: string;
}

interface ParameterVersion {
  effective_from: string;
  values: Record<string, { kind: string; value: unknown }>;
}

interface ParameterRule {
  id?: string;
  name: string;
  versions?: ParameterVersion[];
}

export function applyWhatIf(artifactJson: string, edit: WhatIfEdit): WhatIfResult {
  const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact & {
    program: { parameters: ParameterRule[] };
  };
  const matches = artifact.program.parameters.filter((rule) => rule.name === edit.parameter);
  if (matches.length === 0) {
    throw new Error(`No parameter named "${edit.parameter}" in the artifact`);
  }

  let parameterId = edit.parameter;
  let previousValue = "";
  for (const rule of matches) {
    parameterId = rule.id ?? rule.name;
    for (const version of rule.versions ?? []) {
      for (const entry of Object.values(version.values)) {
        if (previousValue === "") previousValue = String(entry.value);
        entry.value = entry.kind === "integer" ? Math.round(Number(edit.value)) : edit.value;
      }
    }
  }

  return { artifactJson: JSON.stringify(artifact), parameterId, previousValue };
}
