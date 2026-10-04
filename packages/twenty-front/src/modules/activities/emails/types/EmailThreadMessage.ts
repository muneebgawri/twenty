import { type EmailThreadMessageParticipant } from '@/activities/emails/types/EmailThreadMessageParticipant';
import { type MessageThread } from '@/activities/emails/types/MessageThread';

export type EmailThreadMessage = {
  id: string;
  text: string;
  receivedAt: string;
  deliveryStatus: 'SENT' | 'OPENED' | 'CLICKED' | null;
  scheduledAt: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastClickedAt: string | null;
  openCount: number;
  clickCount: number;
  subject: string;
  headerMessageId: string;
  messageThreadId: string;
  messageParticipants: EmailThreadMessageParticipant[];
  messageThread: MessageThread;
  __typename: 'EmailThreadMessage';
};
