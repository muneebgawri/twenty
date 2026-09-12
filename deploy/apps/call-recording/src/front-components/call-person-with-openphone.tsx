import { useEffect, useState } from 'react';

import { toDialableNumber } from 'src/utils/phone-match';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useRecordId } from 'twenty-sdk/front-component';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; number: string; name: string }
  | { kind: 'message'; text: string };

// Front components run in a Web Worker, where `location` is read-only, so the
// component cannot start the call itself. It renders a tel: link instead; the
// host mounts it as a real anchor, and clicking it hands the number to
// whichever app is the OS handler for tel: (OpenPhone, once set as default).
const CallPersonWithOpenPhone = () => {
  const personId = useRecordId();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const load = async () => {
      if (!personId) {
        setState({ kind: 'message', text: 'No person is selected.' });

        return;
      }

      const result: any = await new CoreApiClient().query({
        person: {
          __args: { filter: { id: { eq: personId } } },
          id: true,
          name: { firstName: true, lastName: true },
          phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
        },
      } as any);

      const person = result.person;
      const number = toDialableNumber(person?.phones ?? {});

      if (!number) {
        setState({
          kind: 'message',
          text: 'This person has no primary phone number.',
        });

        return;
      }

      const name = [person?.name?.firstName, person?.name?.lastName]
        .filter(Boolean)
        .join(' ');

      setState({ kind: 'ready', number, name });
    };

    load().catch(() =>
      setState({ kind: 'message', text: 'Could not load this person.' }),
    );
  }, [personId]);

  if (state.kind === 'loading') {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  if (state.kind === 'message') {
    return <div style={{ padding: 16 }}>{state.text}</div>;
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <a
        href={`tel:${state.number}`}
        style={{ fontSize: 16, fontWeight: 600 }}
      >
        Call {state.name || state.number} · {state.number}
      </a>
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        Opens in OpenPhone if it is your default calling app.
      </span>
    </div>
  );
};

export const CALL_PERSON_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  'f8312dd9-c712-48b1-b4a4-49d4d4c87afc';

// The "Call with OpenPhone" command that opens this component is defined in
// src/command-menu-items (SDK 2.39 moved commands out of front components).
export default defineFrontComponent({
  universalIdentifier: CALL_PERSON_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'Call person with OpenPhone',
  description: 'Shows a click-to-call link for the selected person',
  component: CallPersonWithOpenPhone,
});
