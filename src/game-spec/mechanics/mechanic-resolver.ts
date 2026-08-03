import type { StableId } from "../game-spec-schema";
import type { MechanicRuntimeScope } from "./mechanic-registry";

export type MechanicIntentConnection = {
  direction: "input" | "output";
  port: StableId;
};

export type MechanicReferenceKind =
  | "asset"
  | "entity"
  | "objective"
  | "region"
  | "scene";

export type MechanicIntentReference = {
  kind: MechanicReferenceKind;
  id: StableId;
};

export type MechanicIntentConfigurationValue = {
  key: StableId;
  value: boolean | number | string;
};

export type MechanicIntentAmbiguity = {
  id: StableId;
  description: string;
  inferredValue?: string;
  rationale?: string;
  reversible?: true;
};

export type MechanicIntent = {
  id: StableId;
  summary: string;
  triggers: readonly StableId[];
  actors: readonly StableId[];
  targets: readonly StableId[];
  behaviors: readonly StableId[];
  ownedObjects: readonly StableId[];
  stateChanges: readonly StableId[];
  temporalRules: readonly StableId[];
  spatialRules: readonly StableId[];
  constraints: readonly StableId[];
  configuration: readonly MechanicIntentConfigurationValue[];
  connections: readonly MechanicIntentConnection[];
  references: readonly MechanicIntentReference[];
  outcomes: readonly StableId[];
  requiredCapabilities: readonly StableId[];
  ambiguities: readonly MechanicIntentAmbiguity[];
};

export type BuiltInMechanicConfigurationField =
  | {
      key: StableId;
      valueType: "number";
      minimum?: number;
      maximum?: number;
    }
  | {
      key: StableId;
      valueType: "enum";
      values: readonly string[];
    }
  | {
      key: StableId;
      valueType: "boolean";
    };

export type BuiltInMechanicContractCoverage = {
  triggers: readonly StableId[];
  actors: readonly StableId[];
  targets: readonly StableId[];
  behaviors: readonly StableId[];
  ownedObjects: readonly StableId[];
  stateChanges: readonly StableId[];
  temporalRules: readonly StableId[];
  spatialRules: readonly StableId[];
  constraints: readonly StableId[];
  configuration: readonly BuiltInMechanicConfigurationField[];
  connections: readonly MechanicIntentConnection[];
  references: readonly MechanicReferenceKind[];
  outcomes: readonly StableId[];
};

export type BuiltInMechanicContract = {
  mechanicType: StableId;
  scope: MechanicRuntimeScope;
  coverage: BuiltInMechanicContractCoverage;
  compatibleWith: readonly StableId[];
};

export type MechanicRequirementCategory =
  | "actor"
  | "behavior"
  | "configuration"
  | "connection"
  | "constraint"
  | "outcome"
  | "owned_object"
  | "reference"
  | "spatial_rule"
  | "state_change"
  | "target"
  | "temporal_rule"
  | "trigger";

export type MechanicCoverageRequirement = {
  category: MechanicRequirementCategory;
  value: string;
  coveredBy: StableId[];
};

export type MechanicCoverageEvidence = {
  coveredRequirements: MechanicCoverageRequirement[];
  uncoveredRequirements: MechanicCoverageRequirement[];
};

type IntentCoverageRequirement = Omit<
  MechanicCoverageRequirement,
  "coveredBy"
> & {
  configurationValue?: MechanicIntentConfigurationValue;
  referenceValue?: MechanicIntentReference;
};

export type MechanicResolutionAssumption = {
  ambiguityId: StableId;
  description: string;
  inferredValue: string;
  rationale: string;
  reversible: true;
};

export type BuiltInMechanicResolution = {
  kind: "built_in";
  intentId: StableId;
  mechanicType: StableId;
  assumptions: MechanicResolutionAssumption[];
  coverage: MechanicCoverageEvidence;
};

export type BuiltInMechanicCompositionResolution = {
  kind: "built_in_composition";
  intentId: StableId;
  mechanicTypes: StableId[];
  assumptions: MechanicResolutionAssumption[];
  coverage: MechanicCoverageEvidence;
};

export type GeneratedMechanicResolution = {
  kind: "generated_mechanic";
  intentId: StableId;
  candidateBuiltInTypes: StableId[];
  assumptions: MechanicResolutionAssumption[];
  coverage: MechanicCoverageEvidence;
};

export type MechanicCapabilityGapResolution = {
  kind: "capability_gap";
  intentId: StableId;
  missingCapabilities: StableId[];
  assumptions: MechanicResolutionAssumption[];
  coverage: MechanicCoverageEvidence;
};

export type MechanicClarificationFailureResolution = {
  kind: "clarification_failure";
  intentId: StableId;
  strategy: "infer_or_fail";
  unresolvedAmbiguities: readonly MechanicIntentAmbiguity[];
};

export type MechanicResolution =
  | BuiltInMechanicResolution
  | BuiltInMechanicCompositionResolution
  | GeneratedMechanicResolution
  | MechanicCapabilityGapResolution
  | MechanicClarificationFailureResolution;

export type ResolveMechanicIntentInput = {
  intent: MechanicIntent;
  builtInContracts: readonly BuiltInMechanicContract[];
  availableCapabilities: readonly StableId[];
  clarificationStrategy: "infer_or_fail";
};

export function resolveMechanicIntent({
  intent,
  builtInContracts,
  availableCapabilities,
  clarificationStrategy,
}: ResolveMechanicIntentInput): MechanicResolution {
  const unresolvedAmbiguities = intent.ambiguities.filter(
    (ambiguity) =>
      !ambiguity.inferredValue ||
      !ambiguity.rationale ||
      ambiguity.reversible !== true
  );

  if (unresolvedAmbiguities.length > 0) {
    return {
      kind: "clarification_failure",
      intentId: intent.id,
      strategy: clarificationStrategy,
      unresolvedAmbiguities,
    };
  }

  if (getIntentRequirements(intent).length === 0) {
    return {
      kind: "clarification_failure",
      intentId: intent.id,
      strategy: clarificationStrategy,
      unresolvedAmbiguities: [
        {
          id: "ambiguity_missing_requirements",
          description:
            "The mechanic intent does not contain any behavior requirements to resolve.",
        },
      ],
    };
  }

  const assumptions = intent.ambiguities.map((ambiguity) => ({
    ambiguityId: ambiguity.id,
    description: ambiguity.description,
    inferredValue: requireInferenceValue(ambiguity),
    rationale: requireInferenceRationale(ambiguity),
    reversible: true as const,
  }));

  for (const contract of builtInContracts) {
    const coverage = getCoverageEvidence(intent, [contract]);

    if (coverage.uncoveredRequirements.length === 0) {
      return {
        kind: "built_in",
        intentId: intent.id,
        mechanicType: contract.mechanicType,
        assumptions,
        coverage,
      };
    }
  }

  const builtInComposition = findCoveringCompatibleComposition(
    intent,
    builtInContracts
  );

  if (builtInComposition) {
    return {
      kind: "built_in_composition",
      intentId: intent.id,
      mechanicTypes: builtInComposition.contracts.map(
        (contract) => contract.mechanicType
      ),
      assumptions,
      coverage: builtInComposition.coverage,
    };
  }

  const coverage = getBestCompatibleCoverageEvidence(intent, builtInContracts);
  const availableCapabilitySet = new Set(availableCapabilities);
  const missingCapabilities = intent.requiredCapabilities.filter(
    (capability) => !availableCapabilitySet.has(capability)
  );

  if (missingCapabilities.length > 0) {
    return {
      kind: "capability_gap",
      intentId: intent.id,
      missingCapabilities,
      assumptions,
      coverage,
    };
  }

  return {
    kind: "generated_mechanic",
    intentId: intent.id,
    candidateBuiltInTypes: getContributingContractTypes(
      coverage.coveredRequirements
    ),
    assumptions,
    coverage,
  };
}

function getBestCompatibleCoverageEvidence(
  intent: MechanicIntent,
  contracts: readonly BuiltInMechanicContract[]
) {
  let bestCoverage = getCoverageEvidence(intent, []);

  for (let size = 1; size <= contracts.length; size += 1) {
    for (const combination of getContractCombinations(contracts, size)) {
      if (size > 1 && !contractsAreMutuallyCompatible(combination)) {
        continue;
      }

      const coverage = getCoverageEvidence(intent, combination);

      if (
        coverage.uncoveredRequirements.length <
        bestCoverage.uncoveredRequirements.length
      ) {
        bestCoverage = coverage;
      }
    }
  }

  return bestCoverage;
}

function findCoveringCompatibleComposition(
  intent: MechanicIntent,
  contracts: readonly BuiltInMechanicContract[]
) {
  for (let size = 2; size <= contracts.length; size += 1) {
    for (const combination of getContractCombinations(contracts, size)) {
      if (!contractsAreMutuallyCompatible(combination)) {
        continue;
      }

      const coverage = getCoverageEvidence(intent, combination);

      if (coverage.uncoveredRequirements.length === 0) {
        return {
          contracts: combination,
          coverage,
        };
      }
    }
  }

  return undefined;
}

function getContractCombinations(
  contracts: readonly BuiltInMechanicContract[],
  size: number,
  startIndex = 0,
  selected: readonly BuiltInMechanicContract[] = []
): BuiltInMechanicContract[][] {
  if (selected.length === size) {
    return [[...selected]];
  }

  const combinations: BuiltInMechanicContract[][] = [];

  for (let index = startIndex; index < contracts.length; index += 1) {
    combinations.push(
      ...getContractCombinations(contracts, size, index + 1, [
        ...selected,
        contracts[index],
      ])
    );
  }

  return combinations;
}

function contractsAreMutuallyCompatible(
  contracts: readonly BuiltInMechanicContract[]
) {
  return contracts.every((contract, contractIndex) =>
    contracts.every(
      (candidate, candidateIndex) =>
        contractIndex === candidateIndex ||
        (sameScope(contract.scope, candidate.scope) &&
          contract.compatibleWith.includes(candidate.mechanicType) &&
          candidate.compatibleWith.includes(contract.mechanicType))
    )
  );
}

function sameScope(first: MechanicRuntimeScope, second: MechanicRuntimeScope) {
  return first.templateId === second.templateId && first.runtime === second.runtime;
}

function requireInferenceValue(ambiguity: MechanicIntentAmbiguity) {
  if (!ambiguity.inferredValue) {
    throw new Error(`Ambiguity "${ambiguity.id}" has no inferred value.`);
  }

  return ambiguity.inferredValue;
}

function requireInferenceRationale(ambiguity: MechanicIntentAmbiguity) {
  if (!ambiguity.rationale) {
    throw new Error(`Ambiguity "${ambiguity.id}" has no inference rationale.`);
  }

  return ambiguity.rationale;
}

function getContributingContractTypes(
  coveredRequirements: readonly MechanicCoverageRequirement[]
) {
  return [
    ...new Set(
      coveredRequirements.flatMap((requirement) => requirement.coveredBy)
    ),
  ];
}

function getCoverageEvidence(
  intent: MechanicIntent,
  contracts: readonly BuiltInMechanicContract[]
): MechanicCoverageEvidence {
  const requirements = getIntentRequirements(intent);
  const coveredRequirements: MechanicCoverageRequirement[] = [];
  const uncoveredRequirements: MechanicCoverageRequirement[] = [];

  for (const requirement of requirements) {
    const coveredBy = contracts
      .filter((contract) => contractCoversRequirement(contract, requirement))
      .map((contract) => contract.mechanicType);
    const evidence: MechanicCoverageRequirement = {
      category: requirement.category,
      value: requirement.value,
      coveredBy,
    };

    if (coveredBy.length > 0) {
      coveredRequirements.push(evidence);
    } else {
      uncoveredRequirements.push(evidence);
    }
  }

  return {
    coveredRequirements,
    uncoveredRequirements,
  };
}

function getIntentRequirements(
  intent: MechanicIntent
): IntentCoverageRequirement[] {
  return [
    ...toRequirements("trigger", intent.triggers),
    ...toRequirements("actor", intent.actors),
    ...toRequirements("target", intent.targets),
    ...toRequirements("behavior", intent.behaviors),
    ...toRequirements("owned_object", intent.ownedObjects),
    ...toRequirements("state_change", intent.stateChanges),
    ...toRequirements("temporal_rule", intent.temporalRules),
    ...toRequirements("spatial_rule", intent.spatialRules),
    ...toRequirements("constraint", intent.constraints),
    ...intent.configuration.map(({ key, value }) => ({
      category: "configuration" as const,
      value: `${key}=${String(value)}`,
      configurationValue: { key, value },
    })),
    ...intent.connections.map(({ direction, port }) => ({
      category: "connection" as const,
      value: `${direction}:${port}`,
    })),
    ...intent.references.map((reference) => ({
      category: "reference" as const,
      value: `${reference.kind}:${reference.id}`,
      referenceValue: reference,
    })),
    ...toRequirements("outcome", intent.outcomes),
  ];
}

function toRequirements(
  category: Exclude<
    MechanicRequirementCategory,
    "configuration" | "connection" | "reference"
  >,
  values: readonly string[]
): IntentCoverageRequirement[] {
  return values.map((value) => ({
    category,
    value,
  }));
}

function contractCoversRequirement(
  contract: BuiltInMechanicContract,
  requirement: IntentCoverageRequirement
) {
  if (requirement.category === "configuration") {
    const configurationValue = requirement.configurationValue;

    if (!configurationValue) {
      return false;
    }

    return contract.coverage.configuration.some((field) =>
      configurationFieldCoversValue(field, configurationValue)
    );
  }

  if (requirement.category === "connection") {
    return contract.coverage.connections.some(
      ({ direction, port }) => `${direction}:${port}` === requirement.value
    );
  }

  if (requirement.category === "reference") {
    return (
      requirement.referenceValue !== undefined &&
      contract.coverage.references.includes(requirement.referenceValue.kind)
    );
  }

  const coverageByCategory = {
    actor: contract.coverage.actors,
    behavior: contract.coverage.behaviors,
    constraint: contract.coverage.constraints,
    outcome: contract.coverage.outcomes,
    owned_object: contract.coverage.ownedObjects,
    spatial_rule: contract.coverage.spatialRules,
    state_change: contract.coverage.stateChanges,
    target: contract.coverage.targets,
    temporal_rule: contract.coverage.temporalRules,
    trigger: contract.coverage.triggers,
  } satisfies Record<
    Exclude<
      MechanicRequirementCategory,
      "configuration" | "connection" | "reference"
    >,
    readonly string[]
  >;

  const coveredValues: readonly string[] =
    coverageByCategory[requirement.category];
  return coveredValues.includes(requirement.value);
}

function configurationFieldCoversValue(
  field: BuiltInMechanicConfigurationField,
  { key, value }: MechanicIntentConfigurationValue
) {
  if (field.key !== key) {
    return false;
  }

  if (field.valueType === "boolean") {
    return typeof value === "boolean";
  }

  if (field.valueType === "enum") {
    return typeof value === "string" && field.values.includes(value);
  }

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (field.minimum === undefined || value >= field.minimum) &&
    (field.maximum === undefined || value <= field.maximum)
  );
}
