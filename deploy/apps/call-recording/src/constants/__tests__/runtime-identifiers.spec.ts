import { describe, expect, it } from 'vitest';

import { CALL_RECORDING_AUDIO_FIELD_UNIVERSAL_IDENTIFIER } from 'src/constants/runtime-identifiers';
import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-sdk/define';

describe('runtime identifiers', () => {
  it('match the standard callRecording audio field in the installed SDK', () => {
    expect(CALL_RECORDING_AUDIO_FIELD_UNIVERSAL_IDENTIFIER).toBe(
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.callRecording.fields.audio
        .universalIdentifier,
    );
  });
});
