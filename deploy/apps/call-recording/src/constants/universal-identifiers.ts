import {
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

// Since Twenty v2.10, callRecording is a standard object. This app extends it
// with OpenPhone-specific fields instead of defining its own object. (On the
// v2.10 upgrade Twenty renames any older app-defined callRecording object to
// "callRecordingOld"; this version removes that object.)
export const CALL_RECORDING = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.callRecording;

export const CALL_RECORDING_OBJECT_UNIVERSAL_IDENTIFIER =
  CALL_RECORDING.universalIdentifier;

export const PERSON_OBJECT_UNIVERSAL_IDENTIFIER =
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier;

export const CALL_RECORDING_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER =
  STANDARD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIERS.callRecordingRecordPage
    .universalIdentifier;

// Fields this app adds. Names are prefixed so a future upstream field with a
// plain name (e.g. `person`, `direction`) cannot collide with them.
export const OPENPHONE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER =
  '6a1d3f52-9c84-4b27-8e60-2f5b7c9d0a41';
export const OPENPHONE_NUMBER_FIELD_UNIVERSAL_IDENTIFIER =
  'b2e7c490-5d18-4f3a-9b62-8c1e4a7f3d05';
export const OPENPHONE_DURATION_FIELD_UNIVERSAL_IDENTIFIER =
  '4f9a2c61-8e37-4d05-b1c8-7a3e6d2b9f14';
export const OPENPHONE_PERSON_FIELD_UNIVERSAL_IDENTIFIER =
  'd8c35e17-2a94-4b6f-a0d3-5e9f1c7b4a26';
export const PERSON_OPENPHONE_CALL_RECORDINGS_FIELD_UNIVERSAL_IDENTIFIER =
  '93b6f0a8-4c25-4e71-8d9a-1f6e3c5b7a82';

export const RECORDING_TAB_UNIVERSAL_IDENTIFIER =
  'e1f47b23-6d98-4c0a-b5e2-9a7c3d1f8b64';
export const RECORDING_PLAYER_WIDGET_UNIVERSAL_IDENTIFIER =
  '7b2f9e40-3c16-4a85-9d71-e0c4b8a6f213';
export const RECORDING_PERSON_WIDGET_UNIVERSAL_IDENTIFIER =
  '5c0e8a91-7f23-4b6d-9e14-3a8d2c6f0b57';

export const CALL_PERSON_COMMAND_UNIVERSAL_IDENTIFIER =
  '2b991919-6f27-4f3d-8d72-7194ed7d0904';
