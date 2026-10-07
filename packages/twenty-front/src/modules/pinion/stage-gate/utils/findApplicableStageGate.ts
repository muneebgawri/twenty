import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import {
  type FieldMetadataItem,
  type FieldMetadataItemOption,
} from '@/object-metadata/types/FieldMetadataItem';
import { type StageGate } from '@/pinion/stage-gate/types/StageGate';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

export type ApplicableStageGate = {
  gate: StageGate;
  requiredFieldMetadataItem: FieldMetadataItem;
  requiredFieldOptions: FieldMetadataItemOption[];
  // The label of the stage the card is entering ("Closed Lost"), read from the stage field's own options.
  gatedValueLabel: string;
};

type FindApplicableStageGateArgs = {
  gates: readonly StageGate[];
  objectMetadataItem: Pick<
    EnrichedObjectMetadataItem,
    'nameSingular' | 'fields'
  >;
  stageFieldMetadataItem: Pick<FieldMetadataItem, 'name' | 'options'>;
  destinationValue: string | null;
};

// Which gate, if any, applies to a card entering `destinationValue`. Driven entirely by metadata: the gate only
// applies when the object really has the required field and it is an active SELECT, so on a workspace that lacks it
// the board behaves exactly like stock Twenty.
export const findApplicableStageGate = ({
  gates,
  objectMetadataItem,
  stageFieldMetadataItem,
  destinationValue,
}: FindApplicableStageGateArgs): ApplicableStageGate | null => {
  const gate = gates.find(
    (candidate) =>
      candidate.objectNameSingular === objectMetadataItem.nameSingular &&
      candidate.stageFieldName === stageFieldMetadataItem.name &&
      candidate.gatedValue === destinationValue,
  );

  if (!isDefined(gate)) {
    return null;
  }

  const requiredFieldMetadataItem = objectMetadataItem.fields.find(
    (field) =>
      field.name === gate.requiredFieldName &&
      field.type === FieldMetadataType.SELECT &&
      field.isActive,
  );

  const requiredFieldOptions = requiredFieldMetadataItem?.options ?? [];

  if (
    !isDefined(requiredFieldMetadataItem) ||
    requiredFieldOptions.length === 0
  ) {
    return null;
  }

  const gatedValueLabel =
    stageFieldMetadataItem.options?.find(
      (option) => option.value === gate.gatedValue,
    )?.label ?? gate.gatedValue;

  return {
    gate,
    requiredFieldMetadataItem,
    requiredFieldOptions: [...requiredFieldOptions].sort(
      (first, second) => first.position - second.position,
    ),
    gatedValueLabel,
  };
};
