import { useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineSettingsFrontComponent } from 'twenty-sdk/define';

export const SIGNATURE_SETTINGS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '9f5e3c70-bd8e-4a6b-8517-82e74b0cd693';

type Mailbox = {
  id: string;
  handle: string;
  provider: string | null;
  authFailedAt: string | null;
};

type Signature = {
  id: string;
  connectedAccountId: string;
  body: string | null;
  isEnabled: boolean | null;
};

/**
 * Settings → Pinion email. One signature per connected mailbox.
 *
 * The mailbox list comes from `myConnectedAccounts` on the METADATA endpoint,
 * not the core one: connectedAccount is not an object and the core root Query
 * is records-only. That call needs user context, which a front component's
 * token carries and an API key's does not.
 */
const SignatureSettings = () => {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [signatures, setSignatures] = useState<Record<string, Signature>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metadata: any = await new MetadataApiClient().query({
        myConnectedAccounts: {
          id: true,
          handle: true,
          provider: true,
          authFailedAt: true,
        },
      } as any);

      const accounts: Mailbox[] = metadata.myConnectedAccounts ?? [];
      setMailboxes(accounts);

      const core: any = await new CoreApiClient().query({
        emailSignatures: {
          __args: { first: 200 },
          edges: {
            node: {
              id: true,
              connectedAccountId: true,
              body: true,
              isEnabled: true,
            },
          },
        },
      } as any);

      const byAccount: Record<string, Signature> = {};
      for (const edge of core.emailSignatures?.edges ?? []) {
        byAccount[edge.node.connectedAccountId] = edge.node;
      }
      setSignatures(byAccount);

      const first = accounts[0]?.id ?? null;
      setSelected(first);
      setDraft(first ? (byAccount[first]?.body ?? '') : '');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = (accountId: string) => {
    setSelected(accountId);
    setDraft(signatures[accountId]?.body ?? '');
    setStatus(null);
  };

  const save = async () => {
    if (selected === null) {
      return;
    }
    setStatus('Saving…');
    setError(null);

    const existing = signatures[selected];
    const handle = mailboxes.find((m) => m.id === selected)?.handle ?? '';

    try {
      const client = new CoreApiClient();
      if (existing) {
        const result: any = await client.mutation({
          updateEmailSignature: {
            __args: {
              id: existing.id,
              data: { body: draft, handle, isEnabled: true },
            },
            id: true,
            connectedAccountId: true,
            body: true,
            isEnabled: true,
          },
        } as any);
        setSignatures((prior) => ({
          ...prior,
          [selected]: result.updateEmailSignature,
        }));
      } else {
        const result: any = await client.mutation({
          createEmailSignature: {
            __args: {
              data: {
                connectedAccountId: selected,
                handle,
                body: draft,
                isEnabled: true,
              },
            },
            id: true,
            connectedAccountId: true,
            body: true,
            isEnabled: true,
          },
        } as any);
        setSignatures((prior) => ({
          ...prior,
          [selected]: result.createEmailSignature,
        }));
      }
      setStatus('Saved');
    } catch (cause) {
      setStatus(null);
      setError((cause as Error).message);
    }
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Loading mailboxes…</div>;
  }

  if (mailboxes.length === 0) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h2 style={{ marginTop: 0 }}>Email signatures</h2>
        <p>
          No connected mailboxes. Connect one under Settings → Accounts, then
          come back.
        </p>
        {error !== null && <p style={{ color: '#b42318' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Email signatures</h2>
      <p style={{ color: '#667085' }}>
        Appended when sending from that mailbox. Resolved at send time, so
        editing it here also changes messages already scheduled.
      </p>

      <label
        htmlFor="pinion-mailbox"
        style={{ display: 'block', fontWeight: 600, marginTop: 16 }}
      >
        Mailbox
      </label>
      <select
        id="pinion-mailbox"
        value={selected ?? ''}
        onChange={(event) => choose(event.target.value)}
        style={{ width: '100%', padding: 8, marginTop: 4 }}
      >
        {mailboxes.map((mailbox) => (
          <option key={mailbox.id} value={mailbox.id}>
            {mailbox.handle}
            {mailbox.authFailedAt !== null ? ' — reconnect needed' : ''}
          </option>
        ))}
      </select>

      <label
        htmlFor="pinion-signature"
        style={{ display: 'block', fontWeight: 600, marginTop: 16 }}
      >
        Signature
      </label>
      <textarea
        id="pinion-signature"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={10}
        style={{ width: '100%', padding: 8, marginTop: 4, fontFamily: 'inherit' }}
      />

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={save} style={{ padding: '8px 16px' }}>
          Save
        </button>
        {status !== null && <span style={{ color: '#027a48' }}>{status}</span>}
        {error !== null && <span style={{ color: '#b42318' }}>{error}</span>}
      </div>
    </div>
  );
};

export default defineSettingsFrontComponent({
  universalIdentifier: SIGNATURE_SETTINGS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'signature-settings',
  description: 'Per-mailbox email signatures',
  component: SignatureSettings,
});
