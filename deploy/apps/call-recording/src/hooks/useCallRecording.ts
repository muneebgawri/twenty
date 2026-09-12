import { useEffect, useState } from 'react';

import { isDefined } from 'src/utils/is-defined';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useRecordId } from 'twenty-sdk/front-component';

// The typed client is generated per workspace by `twenty dev`; outside that
// the query result is untyped, so the FILES field shape is spelled out here.
export type AudioFile = {
  fileId: string;
  label: string;
  url: string | null;
  extension: string | null;
};

// Reads the standard callRecording's `audio` field. Transcript and summary are
// shown by Twenty's own call-recording widgets, so they are not fetched here.
export const useCallRecordingAudio = () => {
  const recordId = useRecordId();
  const [audio, setAudio] = useState<AudioFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!isDefined(recordId)) {
        setError(new Error('Record ID is not defined'));
        setLoading(false);

        return;
      }

      try {
        const result: any = await new CoreApiClient().query({
          callRecording: {
            __args: { filter: { id: { eq: recordId } } },
            audio: { fileId: true, label: true, url: true, extension: true },
          },
        } as any);

        const file = result.callRecording?.audio?.[0];

        if (!cancelled) {
          setAudio(
            file
              ? {
                  fileId: file.fileId,
                  label: file.label,
                  url: file.url ?? null,
                  extension: file.extension ?? null,
                }
              : null,
          );
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError
              : new Error('Failed to fetch call recording'),
          );
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  return { audio, loading, error };
};
