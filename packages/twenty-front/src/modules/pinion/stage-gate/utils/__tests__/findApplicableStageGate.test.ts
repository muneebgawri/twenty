import { STAGE_GATES } from '@/pinion/stage-gate/constants/StageGates';
import { findApplicableStageGate } from '@/pinion/stage-gate/utils/findApplicableStageGate';
import { FieldMetadataType } from 'twenty-shared/types';

type Args = Parameters<typeof findApplicableStageGate>[0];

const option = (value: string, label: string, position: number) => ({
  id: `id-${value}`,
  value,
  label,
  position,
  color: 'gray' as const,
});

const lostReasonField = {
  name: 'lostReason',
  label: 'Lost reason',
  type: FieldMetadataType.SELECT,
  isActive: true,
  options: [
    option('TIMING', 'Timing', 1),
    option('PRICE_BUDGET', 'Price / Budget', 0),
  ],
};

const buildArgs = (overrides: Partial<Args> = {}): Args =>
  ({
    gates: STAGE_GATES,
    objectMetadataItem: {
      nameSingular: 'opportunity',
      fields: [lostReasonField],
    },
    stageFieldMetadataItem: {
      name: 'stage',
      options: [option('CLOSED_LOST', 'Closed Lost', 6)],
    },
    destinationValue: 'CLOSED_LOST',
    ...overrides,
  }) as Args;

describe('findApplicableStageGate', () => {
  it('applies when a deal enters Closed Lost and Lost reason exists', () => {
    const result = findApplicableStageGate(buildArgs());

    expect(result?.gate.requiredFieldName).toBe('lostReason');
    expect(result?.gatedValueLabel).toBe('Closed Lost');
  });

  it('lists the reasons in the field own order, not the order they arrived in', () => {
    const result = findApplicableStageGate(buildArgs());

    expect(result?.requiredFieldOptions.map((o) => o.value)).toEqual([
      'PRICE_BUDGET',
      'TIMING',
    ]);
  });

  it('does not apply to any other stage', () => {
    expect(
      findApplicableStageGate(buildArgs({ destinationValue: 'CUSTOMER' })),
    ).toBeNull();
  });

  it('does not apply to the "no value" column', () => {
    expect(
      findApplicableStageGate(buildArgs({ destinationValue: null })),
    ).toBeNull();
  });

  it('does not apply to another object that happens to have a stage', () => {
    expect(
      findApplicableStageGate(
        buildArgs({
          objectMetadataItem: {
            nameSingular: 'company',
            fields: [lostReasonField],
          },
        } as unknown as Partial<Args>),
      ),
    ).toBeNull();
  });

  it('does not apply when the board is grouped by a different field', () => {
    expect(
      findApplicableStageGate(
        buildArgs({
          stageFieldMetadataItem: { name: 'closeDate', options: [] },
        } as unknown as Partial<Args>),
      ),
    ).toBeNull();
  });

  describe('on a workspace without the required field it behaves like stock Twenty', () => {
    it('has no gate when the field is missing', () => {
      expect(
        findApplicableStageGate(
          buildArgs({
            objectMetadataItem: { nameSingular: 'opportunity', fields: [] },
          } as unknown as Partial<Args>),
        ),
      ).toBeNull();
    });

    it('has no gate when the field is inactive', () => {
      expect(
        findApplicableStageGate(
          buildArgs({
            objectMetadataItem: {
              nameSingular: 'opportunity',
              fields: [{ ...lostReasonField, isActive: false }],
            },
          } as unknown as Partial<Args>),
        ),
      ).toBeNull();
    });

    it('has no gate when the field is not a select', () => {
      expect(
        findApplicableStageGate(
          buildArgs({
            objectMetadataItem: {
              nameSingular: 'opportunity',
              fields: [{ ...lostReasonField, type: FieldMetadataType.TEXT }],
            },
          } as unknown as Partial<Args>),
        ),
      ).toBeNull();
    });

    it('has no gate when the select has no options to choose from', () => {
      expect(
        findApplicableStageGate(
          buildArgs({
            objectMetadataItem: {
              nameSingular: 'opportunity',
              fields: [{ ...lostReasonField, options: [] }],
            },
          } as unknown as Partial<Args>),
        ),
      ).toBeNull();
    });
  });

  it('falls back to the raw value when the stage option has no label', () => {
    const result = findApplicableStageGate(
      buildArgs({
        stageFieldMetadataItem: { name: 'stage', options: [] },
      } as unknown as Partial<Args>),
    );

    expect(result?.gatedValueLabel).toBe('CLOSED_LOST');
  });
});
