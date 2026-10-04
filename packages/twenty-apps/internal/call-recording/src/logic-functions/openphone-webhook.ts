import crypto from 'node:crypto';

import { RECORDING_FILE_FIELD_UNIVERSAL_IDENTIFIER } from 'src/objects/call-recording';
import { defineLogicFunction } from 'twenty-sdk';
import { CoreApiClient, MetadataApiClient } from 'twenty-sdk/clients';

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
  data: { object: OpenPhoneCall };
};

type LogicFunctionEvent = {
  body?: OpenPhoneWebhookBody;
  headers?: Record<string, string | string[] | undefined>;
};

const getHeader = (
  headers: LogicFunctionEvent['headers'],
  name: string,
): string | undefined => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
};

const verifySignature = (
  body: OpenPhoneWebhookBody,
  signatureHeader: string | undefined,
): void => {
  const signingKey = process.env.OPENPHONE_WEBHOOK_SIGNING_KEY;

  if (!signingKey) {
    throw new Error('OPENPHONE_WEBHOOK_SIGNING_KEY is not configured');
  }

  const [scheme, version, timestamp, providedDigest] =
    signatureHeader?.split(';') ?? [];

  if (scheme !== 'hmac' || version !== '1' || !timestamp || !providedDigest) {
    throw new Error('Invalid OpenPhone webhook signature header');
  }

  const timestampNumber = Number(timestamp);
  const timestampMs =
    timestampNumber > 10_000_000_000 ? timestampNumber : timestampNumber * 1000;

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
  ) {
    throw new Error('Expired OpenPhone webhook signature');
  }

  const compactPayload = JSON.stringify(body);
  const digest = crypto
    .createHmac('sha256', Buffer.from(signingKey, 'base64'))
    .update(`${timestamp}.${compactPayload}`)
    .digest('base64');
  const expected = Buffer.from(digest);
  const provided = Buffer.from(providedDigest);

  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    throw new Error('OpenPhone webhook signature verification failed');
  }
};

const findPersonByPhone = async (
  client: InstanceType<typeof CoreApiClient>,
  phoneNumber: string,
): Promise<string | undefined> => {
  const result: any = await client.query({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { eq: phoneNumber } } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  } as any);

  return result.people?.edges?.[0]?.node?.id;
};

const findCallRecording = async (
  client: InstanceType<typeof CoreApiClient>,
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

const handler = async (event: LogicFunctionEvent) => {
  const body = event.body;

  if (!body) {
    throw new Error('Missing OpenPhone webhook body');
  }

  verifySignature(body, getHeader(event.headers, 'openphone-signature'));

  if (body.type !== 'call.recording.completed') {
    return { ignored: true, eventType: body.type };
  }

  const call = body.data?.object;
  const recording = call?.media?.find((item) =>
    item.type.toLowerCase().startsWith('audio/'),
  );

  if (!call?.id || !recording?.url) {
    throw new Error('OpenPhone recording event is missing call media');
  }

  const client = new CoreApiClient();
  const existingId = await findCallRecording(client, call.id);

  if (existingId) {
    return { success: true, providerCallId: call.id, duplicate: true };
  }

  const response = await fetch(recording.url);

  if (!response.ok) {
    throw new Error(
      `Unable to download OpenPhone recording: ${response.status}`,
    );
  }

  const contentType = response.headers.get('content-type') ?? recording.type;
  const extension = contentType.includes('wav') ? 'wav' : 'mp3';
  const metadataClient = new MetadataApiClient();
  const uploaded = await metadataClient.uploadFile(
    Buffer.from(await response.arrayBuffer()),
    `openphone-${call.id}.${extension}`,
    contentType,
    RECORDING_FILE_FIELD_UNIVERSAL_IDENTIFIER,
  );
  const externalPhone = call.direction === 'incoming' ? call.from : call.to;
  const personId = await findPersonByPhone(client, externalPhone);
  const data = {
    name: `OpenPhone ${call.direction} call - ${externalPhone}`,
    providerCallId: call.id,
    direction: call.direction.toUpperCase(),
    phoneNumber: externalPhone,
    durationSeconds: recording.duration ?? call.duration ?? 0,
    createdAt: call.createdAt,
    endedAt: call.completedAt ?? new Date().toISOString(),
    status: 'ENDED',
    recordingFile: [
      { fileId: uploaded.id, label: `openphone-${call.id}.${extension}` },
    ],
    ...(personId ? { personId } : {}),
  };

  await client.mutation({
    createCallRecording: {
      __args: { data: data as any },
      id: true,
    },
  } as any);

  return { success: true, providerCallId: call.id };
};

export default defineLogicFunction({
  universalIdentifier: '9160bd91-b416-4e5b-8fce-6d92fb5ca976',
  name: 'openphone-webhook',
  description: 'Imports completed OpenPhone / Quo call recordings into Twenty',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/openphone/webhook',
    httpMethod: 'POST',
    isAuthRequired: false,
  },
});
