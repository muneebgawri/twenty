import { useCallback, useEffect, useState } from 'react';
import {
  composeSignature,
  type SignatureBranding,
} from 'src/utils/compose-signature';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { defineSettingsFrontComponent } from 'twenty-sdk/define';

export const SIGNATURE_SETTINGS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '9f5e3c70-bd8e-4a6b-8517-82e74b0cd693';

type Mailbox = {
  id: string;
  handle: string;
  authFailedAt: string | null;
};

type Signature = {
  id: string;
  connectedAccountId: string;
  body: string | null;
};

type Branding = SignatureBranding & { id?: string };

// Native form controls do not inherit the host page's colours, so on Twenty's
// dark UI a plain <select>/<textarea> renders as a white box. Inheriting the
// text colour and keeping the background transparent makes both follow
// whichever theme the app is in, rather than hard-coding dark and breaking the
// light one. `colorScheme` does the same for the parts the browser draws
// itself -- the dropdown popup, the scrollbar, the resize grip.
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
  marginTop: 16,
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
 * Settings → Apps → Pinion email → Settings.
 *
 * Two things, deliberately separate:
 *   - BRANDING, one row for the whole workspace. The admin sets the logo once
 *     and every mailbox renders that one, which is the only way signatures
 *     stay uniform across accounts.
 *   - THE SIGNATURE, one per connected mailbox, holding just the personal part.
 *
 * The mailbox list comes from `myConnectedAccounts` on the METADATA endpoint,
 * not the core one: connectedAccount is not an object and the core root Query
 * is records-only. That call needs user context, which a front component's
 * token carries and an API key's does not.
 *
 * The preview is rendered by the same composeSignature() the send path uses,
 * so what is approved here is what goes out.
 */
const SignatureSettings = () => {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [signatures, setSignatures] = useState<Record<string, Signature>>({});
  const [branding, setBranding] = useState<Branding>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const metadata: any = await new MetadataApiClient().query({
        myConnectedAccounts: { id: true, handle: true, authFailedAt: true },
      } as any);
      const accounts: Mailbox[] = metadata.myConnectedAccounts ?? [];
      setMailboxes(accounts);

      const core: any = await new CoreApiClient().query({
        emailSignatures: {
          __args: { first: 200 },
          edges: {
            node: { id: true, connectedAccountId: true, body: true },
          },
        },
        emailSignatureSettings: {
          __args: { first: 1 },
          edges: {
            node: {
              id: true,
              logoUrl: true,
              logoLinkUrl: true,
              logoWidthPx: true,
              footerHtml: true,
              unsubscribeUrlTemplate: true,
            },
          },
        },
      } as any);

      const byAccount: Record<string, Signature> = {};
      for (const edge of core.emailSignatures?.edges ?? []) {
        byAccount[edge.node.connectedAccountId] = edge.node;
      }
      setSignatures(byAccount);
      setBranding(core.emailSignatureSettings?.edges?.[0]?.node ?? {});

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

  const saveBranding = async () => {
    setStatus('Saving branding…');
    setError(null);
    const data = {
      logoUrl: branding.logoUrl ?? '',
      logoLinkUrl: branding.logoLinkUrl ?? '',
      logoWidthPx: branding.logoWidthPx ?? null,
      footerHtml: branding.footerHtml ?? '',
      unsubscribeUrlTemplate: branding.unsubscribeUrlTemplate ?? '',
    };
    try {
      const client = new CoreApiClient();
      // One row for the workspace: update it if it exists, make it if not.
      const result: any = branding.id
        ? await client.mutation({
            updateEmailSignatureSetting: {
              __args: { id: branding.id, data },
              id: true,
            },
          } as any)
        : await client.mutation({
            createEmailSignatureSetting: { __args: { data }, id: true },
          } as any);

      const saved =
        result.updateEmailSignatureSetting ?? result.createEmailSignatureSetting;
      setBranding((prior) => ({ ...prior, id: saved.id }));
      setStatus('Branding saved — applies to everyone');
    } catch (cause) {
      setStatus(null);
      setError((cause as Error).message);
    }
  };

  const saveSignature = async () => {
    if (selected === null) {
      return;
    }
    setStatus('Saving…');
    setError(null);

    const existing = signatures[selected];
    const handle = mailboxes.find((m) => m.id === selected)?.handle ?? '';

    try {
      const client = new CoreApiClient();
      const result: any = existing
        ? await client.mutation({
            updateEmailSignature: {
              __args: {
                id: existing.id,
                data: { body: draft, handle, isEnabled: true },
              },
              id: true,
              connectedAccountId: true,
              body: true,
            },
          } as any)
        : await client.mutation({
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
            },
          } as any);

      const saved = result.updateEmailSignature ?? result.createEmailSignature;
      setSignatures((prior) => ({ ...prior, [selected]: saved }));
      setStatus('Saved');
    } catch (cause) {
      setStatus(null);
      setError((cause as Error).message);
    }
  };

  if (loading) {
    return <div style={{ padding: 24 }}>Loading mailboxes…</div>;
  }

  // A sample address, because the real one is only known per message.
  const PREVIEW_RECIPIENT = 'recipient@example.com';
  const preview = composeSignature(draft, branding, PREVIEW_RECIPIENT);

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>Shared branding</h2>
      <p style={HINT}>
        One logo for the whole workspace, so every signature matches. Set by an
        admin; everyone&apos;s signature picks it up.
      </p>

      <label htmlFor="pinion-logo" style={LABEL}>
        Logo URL
      </label>
      <input
        id="pinion-logo"
        value={branding.logoUrl ?? ''}
        onChange={(event) => {
          setBranding({ ...branding, logoUrl: event.target.value });
          setStatus(null);
        }}
        placeholder="https://pinionpartners.co/logo.png"
        style={CONTROL}
      />
      <p style={HINT}>
        Must be publicly reachable — mail clients fetch it unauthenticated, from
        outside our network, long after the message was sent.
      </p>

      <label htmlFor="pinion-logo-link" style={LABEL}>
        Logo links to
      </label>
      <input
        id="pinion-logo-link"
        value={branding.logoLinkUrl ?? ''}
        onChange={(event) => {
          setBranding({ ...branding, logoLinkUrl: event.target.value });
          setStatus(null);
        }}
        placeholder="https://pinionpartners.co"
        style={CONTROL}
      />

      <label htmlFor="pinion-logo-width" style={LABEL}>
        Logo width (px)
      </label>
      <input
        id="pinion-logo-width"
        type="number"
        value={branding.logoWidthPx ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          setBranding({
            ...branding,
            logoWidthPx: next === '' ? null : Number(next),
          });
          setStatus(null);
        }}
        placeholder="160"
        style={CONTROL}
      />

      <label htmlFor="pinion-unsub" style={LABEL}>
        Unsubscribe URL
      </label>
      <input
        id="pinion-unsub"
        value={branding.unsubscribeUrlTemplate ?? ''}
        onChange={(event) => {
          setBranding({
            ...branding,
            unsubscribeUrlTemplate: event.target.value,
          });
          setStatus(null);
        }}
        placeholder="https://…/api/public/unsubscribe/self?e={{email}}&t=…&k=…"
        style={CONTROL}
      />
      <p style={HINT}>
        Herald&apos;s self-serve link. Keep <code>{'{{email}}'}</code> in it —
        that is replaced with each recipient&apos;s address when the message is
        sent, so one stored link works for everyone. Herald&apos;s page asks for
        confirmation before suppressing, so a link-scanner cannot unsubscribe
        anyone by prefetching it.
      </p>

      <label htmlFor="pinion-footer" style={LABEL}>
        Shared footer (HTML, optional)
      </label>
      <textarea
        id="pinion-footer"
        value={branding.footerHtml ?? ''}
        onChange={(event) => {
          setBranding({ ...branding, footerHtml: event.target.value });
          setStatus(null);
        }}
        rows={3}
        placeholder="<small>Pinion Partners Ltd, London</small>"
        style={{ ...CONTROL, resize: 'vertical' }}
      />

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={saveBranding} style={BUTTON}>
          Save branding
        </button>
      </div>

      <hr
        style={{
          margin: '32px 0',
          border: 0,
          borderTop: '1px solid rgba(128,128,128,0.3)',
        }}
      />

      <h2 style={{ marginTop: 0 }}>Your signature</h2>

      {mailboxes.length === 0 ? (
        <p>
          No connected mailboxes. Connect one under Settings → Accounts, then
          come back.
        </p>
      ) : (
        <>
          <p style={HINT}>
            The personal part only — the logo above is added automatically.
            Resolved at send time, so editing it also changes messages already
            scheduled. HTML is allowed, so{' '}
            <code>&lt;a href=&quot;…&quot;&gt;</code> works for links.
          </p>

          <label htmlFor="pinion-mailbox" style={LABEL}>
            Mailbox
          </label>
          <select
            id="pinion-mailbox"
            value={selected ?? ''}
            onChange={(event) => choose(event.target.value)}
            style={CONTROL}
          >
            {mailboxes.map((mailbox) => (
              <option key={mailbox.id} value={mailbox.id}>
                {mailbox.handle}
                {mailbox.authFailedAt !== null ? ' — reconnect needed' : ''}
              </option>
            ))}
          </select>

          <label htmlFor="pinion-signature" style={LABEL}>
            Signature
          </label>
          <textarea
            id="pinion-signature"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus(null);
            }}
            rows={8}
            placeholder={'Matt Marshall<br>\nHead of PR<br>\n<a href="tel:+442012345678">+44 20 1234 5678</a>'}
            style={{ ...CONTROL, resize: 'vertical' }}
          />

          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={saveSignature} style={BUTTON}>
              Save signature
            </button>
          </div>
        </>
      )}

      <h3 style={{ marginTop: 32 }}>Preview</h3>
      <p style={HINT}>
        Rendered by the same code that builds the signature when a message is
        sent. The unsubscribe link below is shown for{' '}
        <code>recipient@example.com</code>; each message gets its own.
      </p>
      {/*
        An IFRAME, not a styled div. The first version rendered the HTML inline
        and the host page's CSS reshaped it: the table collapsed into two
        columns, so the logo appeared beside the text instead of above it and
        the <br>s looked like they had been dropped. The HTML was correct the
        whole time and the preview was the thing lying, which is the worst way
        for a preview to fail -- it sends you off fixing code that works.
        srcdoc gives the same isolation a mail client has.
      */}
      <iframe
        title="Signature preview"
        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;padding:16px;background:#ffffff">${preview || '<em style="color:#888">Nothing yet</em>'}</body></html>`}
        sandbox=""
        style={{
          marginTop: 8,
          width: '100%',
          height: 220,
          border: '1px solid rgba(128,128,128,0.4)',
          borderRadius: 4,
          background: '#ffffff',
        }}
      />

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setShowSource((prior) => !prior)}
          style={BUTTON}
        >
          {showSource ? 'Hide HTML' : 'Show HTML'}
        </button>
      </div>
      {showSource && (
        // The exact bytes handed to sendEmail. Worth being able to see: the
        // preview is at the mercy of whatever the host page's styles do to it,
        // and a mail client will not treat it the same way either.
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            border: '1px solid rgba(128,128,128,0.4)',
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            fontSize: 12,
            maxHeight: 220,
            overflow: 'auto',
          }}
        >
          {preview}
        </pre>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        {status !== null && <span style={{ color: '#027a48' }}>{status}</span>}
        {error !== null && <span style={{ color: '#b42318' }}>{error}</span>}
      </div>
    </div>
  );
};

export default defineSettingsFrontComponent({
  universalIdentifier: SIGNATURE_SETTINGS_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'signature-settings',
  description: 'Shared branding and per-mailbox email signatures',
  component: SignatureSettings,
});
