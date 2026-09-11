import { RECORDING_FILE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/objects/call-recording';
import {
  OPENPHONE_SIGNATURE_HEADER,
  verifyOpenPhoneSignature,
} from 'src/utils/openphone-signature';
import { nationalNumberCandidates, phoneMatches } from 'src/utils/phone-match';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';

type OpenPhoneCall = {
  id: string;
  from: string;
  to: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
  completedAt?: string | null;
  duration?: number;
  media?: Array<{ url: string; type: string; duration?: number }>;
};

type OpenPhoneWebhookBody = {
  id: string;
  type: string;
  data?: { object?: OpenPhoneCall };
};

// A long call is tens of MB of audio. Refuse anything far beyond that rather
// than buffering an unbounded download in the server process.
const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

const findPersonIdByPhone = async (
  client: CoreApiClient,
  e164: string,
): Promise<string | undefined> => {
  const candidates = nationalNumberCandidates(e164);

  if (candidates.length === 0) {
    return undefined;
  }

  const result: any = await client.query({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { in: candidates } } },
        first: 20,
      },
      edges: {
        node: {
          id: true,
          phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
        },
      },
    },
  } as any);

  // The `in` filter can over-match (a national number that happens to equal
  // another country's split), so confirm against the full number.
  const match = (result.people?.edges ?? []).find((edge: any) =>
    phoneMatches(e164, edge.node.phones ?? {}),
  );

  return match?.node?.id;
};

const findCallRecordingId = async (
  client: CoreApiClient,
  providerCallId: string,
): Promise<string | undefined> => {
  const result: any = await client.query({
    callRecordings: {
      __args: { filter: { providerCallId: { eq: providerCallId } }, first: 1 },
      edges: { node: { id: true } },
    },
  } as any);

  return result.callRecordings?.edges?.[0]?.node?.id;
};

const downloadRecording = async (url: string) => {
  if (!url.startsWith('https://')) {
    throw new Error('OpenPhone recording URL is not https');
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to download OpenPhone recording: ${response.status}`);
  }

  const declaredLength = Number(response.headers.get('content-length'));

  if (declaredLength > MAX_RECORDING_BYTES) {
    throw new Error(`OpenPhone recording is too large: ${declaredLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_RECORDING_BYTES) {
    throw new Error(`OpenPhone recording is too large: ${buffer.length} bytes`);
  }

  return {
    buffer,
    contentType: response.headers.get('content-type') ?? 'audio/mpeg',
  };
};

const handler = async (event: RoutePayload<OpenPhoneWebhookBody>) => {
  verifyOpenPhoneSignature({
    rawBody: event.rawBody,
    signatureHeader: event.headers?.[OPENPHONE_SIGNATURE_HEADER],
    signingKey: process.env.OPENPHONE_WEBHOOK_SIGNING_KEY,
  });

  const body = event.body;

  if (body?.type !== 'call.recording.completed') {
    return { ignored: true, eventType: body?.type ?? null };
  }

  const call = body.data?.object;
  const recording = call?.media?.find((item) =>
    item.type?.toLowerCase().startsWith('audio/'),
  );

  if (!call?.id || !recording?.url) {
    throw new Error('OpenPhone recording event is missing call media');
  }

  if (call.direction !== 'incoming' && call.direction !== 'outgoing') {
    throw new Error(`Unexpected OpenPhone call direction: ${call.direction}`);
  }

  const client = new CoreApiClient();

  // OpenPhone retries deliveries that do not get a 2xx, so the same call can
  // arrive more than once.
  if (await findCallRecordingId(client, call.id)) {
    return { success: true, providerCallId: call.id, duplicate: true };
  }

  const { buffer, contentType } = await downloadRecording(recording.url);
  const extension = contentType.includes('wav') ? 'wav' : 'mp3';
  const fileName = `openphone-${call.id}.${extension}`;

  const uploaded = await new MetadataApiClient().uploadFile(
    buffer,
    fileName,
    contentType,
    RECORDING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  );

  const externalPhone = call.direction === 'incoming' ? call.from : call.to;
  const personId = await findPersonIdByPhone(client, externalPhone);

  await client.mutation({
    createCallRecording: {
      __args: {
        data: {
          name: `OpenPhone ${call.direction} call - ${externalPhone}`,
          providerCallId: call.id,
          direction: call.direction.toUpperCase(),
          phoneNumber: externalPhone,
          durationSeconds: recording.duration ?? call.duration ?? 0,
          createdAt: call.createdAt,
          endedAt: call.completedAt ?? new Date().toISOString(),
          status: 'ENDED',
          recordingFile: [{ fileId: uploaded.id, label: fileName }],
          ...(personId ? { personId } : {}),
        },
      },
      id: true,
    },
  } as any);

  return { success: true, providerCallId: call.id, personMatched: !!personId };
};

export default defineLogicFunction({
  universalIdentifier: '9160bd91-b416-4e5b-8fce-6d92fb5ca976',
  name: 'openphone-webhook',
  description: 'Imports completed OpenPhone / Quo call recordings into Twenty',
  timeoutSeconds: 120,
  handler,
  httpRouteTriggerSettings: {
    path: '/openphone/webhook',
    httpMethod: 'POST',
    isAuthRequired: false,
    // Headers are dropped unless listed here; without this the signature
    // check never sees the header and rejects every delivery.
    forwardedRequestHeaders: [OPENPHONE_SIGNATURE_HEADER],
  },
});
