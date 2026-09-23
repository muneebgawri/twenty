import { useCallback, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useRecordId } from 'twenty-sdk/front-component';

export const TRACKING_PANEL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '3569a768-5556-4553-ba39-f9b187dec3fb';

type TrackingEvent = {
  id: string;
  kind: string | null;
  occurredAt: string | null;
  url: string | null;
  automated: boolean | null;
  automatedReason: string | null;
};

const HINT: React.CSSProperties = { color: '#667085', fontSize: 13 };

/**
 * Opens and clicks for the contact whose page this is.
 *
 * Matched by the person's email rather than a relation: the webhook that
 * writes these rows knows an address, not a Twenty record id, and resolving
 * one at write time would make a public endpoint do a lookup it can be made to
 * repeat.
 *
 * Machine fetches are SHOWN, marked, and counted apart. Hiding them would be
 * tidier and would misrepresent the data -- Apple pre-fetches every image, so
 * a list of "opens" with those quietly removed is a different claim from the
 * one the evidence supports.
 */
const TrackingPanel = () => {
  const recordId = useRecordId();
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!recordId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const core = new CoreApiClient();
      const person: any = await core.query({
        person: {
          __args: { filter: { id: { eq: recordId } } },
          emails: { primaryEmail: true },
        },
      } as any);

      const address = person.person?.emails?.primaryEmail ?? null;
      setEmail(address);

      if (!address) {
        setEvents([]);

        return;
      }

      const result: any = await core.query({
        emailTrackingEvents: {
          __args: {
            filter: { recipient: { ilike: address } },
            orderBy: [{ occurredAt: 'DescNullsLast' }],
            first: 50,
          },
          edges: {
            node: {
              id: true,
              kind: true,
              occurredAt: true,
              url: true,
              automated: true,
              automatedReason: true,
            },
          },
        },
      } as any);

      setEvents(
        (result.emailTrackingEvents?.edges ?? []).map((edge: any) => edge.node),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div style={{ padding: 12 }}>Loading…</div>;
  }

  if (error !== null) {
    return <div style={{ padding: 12, color: '#b42318' }}>{error}</div>;
  }

  if (email === null) {
    return (
      <div style={{ padding: 12, ...HINT }}>
        No email address on this contact, so nothing can be attributed to them.
      </div>
    );
  }

  const human = events.filter((event) => event.automated !== true);
  const machine = events.length - human.length;

  if (events.length === 0) {
    return (
      <div style={{ padding: 12, ...HINT }}>
        Nothing recorded for {email}. Tracking is off unless the sender ticks it
        for a message, and many clients block the pixel — so an empty list does
        not mean the mail went unread.
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <p style={HINT}>
        {human.length} recorded from a person
        {machine > 0 ? `, ${machine} from a proxy or pre-fetch` : ''}. Opens are
        one-directional evidence: a hit is real, silence proves nothing.
      </p>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}
      >
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              style={{ borderTop: '1px solid rgba(128,128,128,0.25)' }}
            >
              <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }}>
                {event.kind === 'CLICKED' ? 'Clicked' : 'Opened'}
              </td>
              <td
                style={{
                  padding: '6px 8px',
                  whiteSpace: 'nowrap',
                  opacity: 0.75,
                }}
              >
                {event.occurredAt
                  ? new Date(event.occurredAt).toLocaleString()
                  : '—'}
              </td>
              <td
                style={{
                  padding: '6px 8px',
                  opacity: 0.75,
                  wordBreak: 'break-all',
                }}
              >
                {event.url ?? ''}
              </td>
              <td
                style={{
                  padding: '6px 0',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {event.automated === true ? (
                  <span style={{ ...HINT, fontSize: 12 }}>
                    machine · {event.automatedReason || 'proxy'}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: TRACKING_PANEL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'tracking-panel',
  description: 'Opens and clicks recorded for this contact',
  component: TrackingPanel,
});
