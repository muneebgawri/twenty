// A rule of the form "a card cannot enter <gatedValue> of <stageFieldName> without a value for
// <requiredFieldName>". It names fields, never ids, so it works on any workspace that has them.
export type StageGate = {
  objectNameSingular: string;
  stageFieldName: string;
  gatedValue: string;
  requiredFieldName: string;
};
