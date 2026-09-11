import styled from '@emotion/styled';
import { useEffect, useState } from 'react';

type SerializedMediaEventData = {
  currentTime?: number;
};

const StyledAudioWrapper = styled.div`
  background: linear-gradient(135deg, #f8f9fb 0%, #eef0f4 100%);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
`;

const StyledAudio = styled.audio`
  width: 100%;
  height: 36px;
  border-radius: 8px;
  outline: none;

  &::-webkit-media-controls-panel {
    background: transparent;
  }
`;

// "audio/mp3" is not a registered type; Chrome tolerates it but Safari skips a
// <source> it does not recognise, leaving the player empty.
const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

type AudioPlayerProps = {
  src: string;
  extension: string;
  onTimeUpdate?: (currentTimeSeconds: number) => void;
};

// Twenty streams files without Content-Length or range support, so an <audio>
// pointed straight at the file URL cannot learn an MP3's length: the control
// reads 0:00 / 0:00 and the scrubber cannot seek. Call recordings are small
// (~100 KB per minute), so download once and play from a blob URL, which gives
// the browser the whole file. If the download fails, the direct URL is used.
const usePlayableSrc = (src: string): string => {
  const [playableSrc, setPlayableSrc] = useState(src);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    setPlayableSrc(src);

    fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (blob !== null && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setPlayableSrc(objectUrl);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;

      if (objectUrl !== undefined) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  return playableSrc;
};

export const AudioPlayer = ({
  src,
  extension,
  onTimeUpdate,
}: AudioPlayerProps) => {
  const playableSrc = usePlayableSrc(src);

  return (
    <StyledAudioWrapper>
      <StyledAudio
        // Remount when the source switches to the blob URL: changing a
        // <source> element's src does not make the media element reload.
        key={playableSrc}
        controls
        onTimeUpdate={(event: unknown) => {
          const currentTime = (event as CustomEvent<SerializedMediaEventData>)
            .detail.currentTime;

          if (typeof currentTime === 'number') {
            onTimeUpdate?.(currentTime);
          }
        }}
      >
        <source src={playableSrc} type={AUDIO_MIME_TYPES[extension] ?? `audio/${extension}`} />
      </StyledAudio>
    </StyledAudioWrapper>
  );
};
