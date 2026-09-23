import { useCallback, useEffect, useState } from 'react';
import {
  composeSignature,
  withTrackingPixel,
} from 'src/utils/compose-signature';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  useSelectedRecordIds,
  useUserId,
} from 'twenty-sdk/front-component';

export const COMPOSER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '2e7b4d16-9c83-4f50-a6d1-3b8e5c7f0a92';

type Mailbox = { id: string; handle: string; authFailedAt: string | null };

const CONTROL: React.CSSProperties = {
  width: '100%',
  padding: 8,
  marginTop: 4,
  background: 'transparent',
  color: 'inherit',
  border: '1px solid rgba(128, 128, 128, 0.4)',
  borderRadius: 4,
  colorScheme: 'light dark',
  font: 'inherit',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginTop: 12,
};

const BUTTON: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: 'inherit',
  border: '1px solid rgba(128, 128, 128, 0.4)',
  borderRadius: 4,
  cursor: 'pointer',
  font: 'inherit',
};

const HINT: React.CSSProperties = { color: '#667085', fontSize: 13 };

/**
 * Our own composer, reached from the command menu on a selected person.
 *
 * Why ours and not Twenty's: there is no extension point in Twenty's native
 * composer -- useSendEmail.ts and useEmailComposerState.ts read no
 * front-component metadata, so an app can only ship its own. That is also what
 * makes the signature, and later the scheduling and tracking, possible at all:
 * Twenty transmits input.body verbatim, so whatever we assemble is what goes.
 *
 * This sends NOW. Scheduling needs cron, cron has no user context, and
 * sendEmail refuses without one -- that is the overlay patch in PRD §4.1 and
 * is deliberately not part of this step.
 *
 * The signature is resolved HERE, at send time, not stored with the draft: an
 * admin editing the shared logo has to change what goes out next, including
 * from a draft opened ten minutes ago.
 */
const Composer = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const userId = useUserId();

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [branding, setBranding] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // OFF by default and per send. An open pixel on a UK press-relations
  // CRM is a consent question, so it is never a stored preference that
  // quietly applies to everybody (PRD §4.2).
  const [trackOpens, setTrackOpens] = useState(false);
  const [workspaceMemberId, setWorkspaceMemberId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metadata: any = await new MetadataApiClient().query({
        myConnectedAccounts: { id: true, handle: true, authFailedAt: true },
      } as any);
      const accounts: Mailbox[] = metadata.myConnectedAccounts ?? [];
      setMailboxes(accounts);
      // Prefer a mailbox that can actually send.
      setFrom(
        (accounts.find((a) => a.authFailedAt === null) ?? accounts[0])?.id ??
          null,
      );

      const core = new CoreApiClient();
      const data: any = await core.query({
        emailSignatures: {
          __args: { first: 200 },
          edges: { node: { connectedAccountId: true, body: true } },
        },
        emailSignatureSettings: {
          __args: { first: 1 },
          edges: {
            node: {
              logoUrl: true,
              logoLinkUrl: true,
              logoWidthPx: true,
              footerHtml: true,
              unsubscribeUrlTemplate: true,
            },
          },
        },
      } as any);

      const byAccount: Record<string, string> = {};
      for (const edge of data.emailSignatures?.edges ?? []) {
        byAccount[edge.node.connectedAccountId] = edge.node.body ?? '';
      }
      setSignatures(byAccount);
      setBranding(data.emailSignatureSettings?.edges?.[0]?.node ?? {});

      // The row-security rule binds on workspaceMember, not user, so the
      // event has to carry the member id rather than the user id.
      try {
        const members: any = await core.query({
          workspaceMembers: {
            __args: { filter: { userId: { eq: userId } }, first: 1 },
            edges: { node: { id: true } },
          },
        } as any);
        setWorkspaceMemberId(members.workspaceMembers?.edges?.[0]?.node?.id ?? null);
      } catch {
        // Tracking simply stays unavailable; the composer still sends.
      }

      // Prefill the recipient from the person the command was opened on.
      //
      // In its OWN try/catch on purpose: a convenience must not be able to
      // take the composer down. The first version let this throw into the
      // outer handler, and a failure here -- the app is granted person:read
      // separately -- surfaced as "FrontComponent error: Failed to fetch"
      // with no composer at all, rather than an empty To field someone could
      // simply type into.
      const ids = selectedRecordIds ?? [];
      if (ids.length > 0) {
        try {
          const people: any = await core.query({
            people: {
              __args: { filter: { id: { in: ids } }, first: 50 },
              edges: { node: { emails: { primaryEmail: true } } },
            },
          } as any);
          const addresses = (people.people?.edges ?? [])
            .map((edge: any) => edge.node?.emails?.primaryEmail)
            .filter((address: string) => typeof address === 'string' && address.length > 0);
          setTo(addresses.join(', '));
        } catch (cause) {
          setStatus(
            `Could not read the selected contact (${(cause as Error).message}) — type the address instead`,
          );
        }
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedRecordIds, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (from === null) {
      return;
    }
    const recipients = to
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address.length > 0);

    if (recipients.length === 0) {
      setError('Add at least one recipient');

      return;
    }
    if (subject.trim().length === 0) {
      setError('Add a subject');

      return;
    }

    setSending(true);
    setStatus(null);
    setError(null);

    const failures: string[] = [];
    const notes = new Set<string>();
    let sent = 0;

    // Groups every tracking event for this send, across all its recipients.
    const messageRef = `tw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // One message per recipient, not one with everyone in `to`. A press
    // contact must not see who else was pitched, and the unsubscribe link is
    // per recipient -- a shared one would let the first person who clicked it
    // suppress somebody else.
    for (const recipient of recipients) {
      const signature = composeSignature(
        signatures[from] ?? '',
        branding,
        recipient,
      );
      let html = signature.length > 0 ? `${body}<br><br>${signature}` : body;

      // Minted per recipient, server side -- the signing key cannot come to a
      // browser. A failure here must not stop the send: tracking is the
      // optional part, so the email goes out untracked rather than not at all.
      if (trackOpens) {
        try {
          const minted: any = await new RestApiClient().post(
            '/s/pinion/mint-tracking',
            {
              body: {
                recipient,
                messageRef,
                sentBy: workspaceMemberId ?? undefined,
              },
            },
          );
          if (minted?.configured === true && minted.openUrl) {
            html = withTrackingPixel(html, minted.openUrl);
          } else if (minted?.configured === false) {
            notes.add('tracking is not configured — sent untracked');
          }
        } catch (cause) {
          notes.add(`tracking failed (${(cause as Error).message}) — sent untracked`);
        }
      }

      try {
        const result: any = await new MetadataApiClient().mutation({
          sendEmail: {
            __args: {
              input: {
                connectedAccountId: from,
                to: recipient,
                cc: cc.trim().length > 0 ? cc.trim() : undefined,
                subject,
                body: html,
              },
            },
            success: true,
            error: true,
            messageThreadId: true,
          },
        } as any);

        if (result.sendEmail?.success === true) {
          sent += 1;
        } else {
          failures.push(`${recipient}: ${result.sendEmail?.error ?? 'failed'}`);
        }
      } catch (cause) {
        failures.push(`${recipient}: ${(cause as Error).message}`);
      }
    }

    setSending(false);
    setStatus(
      [`Sent ${sent} of ${recipients.length}`, ...notes].join(' · '),
    );
    if (failures.length > 0) {
      setError(failures.join(' · '));
    }
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (mailboxes.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        No connected mailbox to send from. Connect one under Settings →
        Accounts.
      </div>
    );
  }

  const signaturePreview = composeSignature(
    from !== null ? (signatures[from] ?? '') : '',
    branding,
    'recipient@example.com',
  );

  return (
    <div style={{ padding: 16 }}>
      <label htmlFor="pinion-from" style={LABEL}>
        From
      </label>
      <select
        id="pinion-from"
        value={from ?? ''}
        onChange={(event) => setFrom(event.target.value)}
        style={CONTROL}
      >
        {mailboxes.map((mailbox) => (
          <option key={mailbox.id} value={mailbox.id}>
            {mailbox.handle}
            {mailbox.authFailedAt !== null ? ' — reconnect needed' : ''}
          </option>
        ))}
      </select>

      <label htmlFor="pinion-to" style={LABEL}>
        To
      </label>
      <input
        id="pinion-to"
        value={to}
        onChange={(event) => setTo(event.target.value)}
        placeholder="one@example.com, two@example.com"
        style={CONTROL}
      />
      <p style={HINT}>
        Comma-separated. Each gets their own message, so nobody sees who else
        was written to.
      </p>

      <label htmlFor="pinion-cc" style={LABEL}>
        Cc
      </label>
      <input
        id="pinion-cc"
        value={cc}
        onChange={(event) => setCc(event.target.value)}
        style={CONTROL}
      />

      <label htmlFor="pinion-subject" style={LABEL}>
        Subject
      </label>
      <input
        id="pinion-subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        style={CONTROL}
      />

      <label htmlFor="pinion-body" style={LABEL}>
        Message
      </label>
      <textarea
        id="pinion-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={10}
        style={{ ...CONTROL, resize: 'vertical' }}
      />
      <p style={HINT}>
        HTML is sent as written. Your signature is added automatically.
      </p>

      <label
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={trackOpens}
          onChange={(event) => setTrackOpens(event.target.checked)}
          style={{ colorScheme: 'light dark' }}
        />
        Track opens for this message
      </label>
      <p style={HINT}>
        Off unless you tick it, every time. Adds an invisible image that tells
        us when the message is opened — think about whether this recipient
        would expect that.
      </p>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer' }}>Signature to be appended</summary>
        <iframe
          title="Signature preview"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:12px;background:#fff">${signaturePreview || '<em style="color:#888">None set</em>'}</body></html>`}
          sandbox=""
          style={{
            marginTop: 8,
            width: '100%',
            height: 180,
            border: '1px solid rgba(128,128,128,0.4)',
            borderRadius: 4,
            background: '#ffffff',
          }}
        />
      </details>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={send}
          disabled={sending}
          style={{ ...BUTTON, opacity: sending ? 0.6 : 1 }}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
        {status !== null && <span style={{ color: '#027a48' }}>{status}</span>}
        {error !== null && <span style={{ color: '#b42318' }}>{error}</span>}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: COMPOSER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'composer',
  description: 'Write and send from your own mailbox, with your signature',
  component: Composer,
});
