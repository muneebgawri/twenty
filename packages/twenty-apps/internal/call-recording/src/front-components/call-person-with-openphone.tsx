import { useEffect, useState } from 'react';

import { defineFrontComponent, useRecordId } from 'twenty-sdk';
import { CoreApiClient } from 'twenty-sdk/clients';

const CallPersonWithOpenPhone = () => {
  const personId = useRecordId();
  const [message, setMessage] = useState('Opening OpenPhone...');

  useEffect(() => {
    const openDialer = async () => {
      if (!personId) {
        setMessage('No person is selected.');

        return;
      }

      const client = new CoreApiClient();
      const result: any = await client.query({
        person: {
          __args: { filter: { id: { eq: personId } } },
          id: true,
          phones: { primaryPhoneNumber: true },
        },
      } as any);
      const phoneNumber = result.person?.phones?.primaryPhoneNumber;

      if (!phoneNumber) {
        setMessage('This person does not have a primary phone number.');

        return;
      }

      globalThis.location.href = `tel:${phoneNumber}`;
      setMessage(`Dialing ${phoneNumber}.`);
    };

    void openDialer();
  }, [personId]);

  return <div>{message}</div>;
};

export default defineFrontComponent({
  universalIdentifier: 'f8312dd9-c712-48b1-b4a4-49d4d4c87afc',
  name: 'Call person with OpenPhone',
  description: 'Starts a click-to-call action for the selected person',
  component: CallPersonWithOpenPhone,
  command: {
    universalIdentifier: '2b991919-6f27-4f3d-8d72-7194ed7d0904',
    label: 'Call with OpenPhone',
    icon: 'IconPhoneCall',
    isPinned: true,
    availabilityType: 'SINGLE_RECORD',
    availabilityObjectUniversalIdentifier:
      '20202020-e674-48e5-a542-72570eee7213',
  },
});
