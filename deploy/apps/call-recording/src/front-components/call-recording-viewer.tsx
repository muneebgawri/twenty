import styled from '@emotion/styled';

import { CallRecordingViewerSkeleton } from 'src/components/CallRecordingViewerSkeleton';
import { MediaPlayer } from 'src/components/MediaPlayer';
import { CALL_RECORDING_VIEWER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/call-recording-viewer-front-component-universal-identifier';
import { useCallRecordingAudio } from 'src/hooks/useCallRecording';
import { isDefined } from 'src/utils/is-defined';
import { defineFrontComponent } from 'twenty-sdk/define';

const StyledContainer = styled.div`
  box-sizing: border-box;
  padding: 20px;
  width: 100%;
`;

const StyledEmpty = styled.div`
  font-size: 13px;
  opacity: 0.7;
  padding: 20px;
`;

export const CallRecordingViewer = () => {
  const { audio, loading, error } = useCallRecordingAudio();

  if (loading) {
    return <CallRecordingViewerSkeleton />;
  }

  if (isDefined(error)) {
    throw error;
  }

  if (!isDefined(audio?.url) || !isDefined(audio?.extension)) {
    return <StyledEmpty>No audio has been attached to this recording.</StyledEmpty>;
  }

  return (
    <StyledContainer>
      <MediaPlayer url={audio.url} extension={audio.extension} />
    </StyledContainer>
  );
};

export default defineFrontComponent({
  universalIdentifier:
    CALL_RECORDING_VIEWER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Call Recording Viewer',
  description: 'Plays the audio of a call recording',
  component: CallRecordingViewer,
});
