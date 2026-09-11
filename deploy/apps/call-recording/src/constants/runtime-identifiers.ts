// Identifiers the logic function needs at runtime.
//
// Logic-function bundles replace `twenty-sdk/define` with a stub, so
// STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS is undefined when the webhook runs:
// anything read from it arrives as `undefined`. These are literal copies.
// runtime-identifiers.spec.ts asserts they still match the SDK, so an upstream
// change fails the tests instead of breaking uploads silently.
export const CALL_RECORDING_AUDIO_FIELD_UNIVERSAL_IDENTIFIER =
  '2eafc2d0-8fec-430c-a939-65ca5fbc0f08';
