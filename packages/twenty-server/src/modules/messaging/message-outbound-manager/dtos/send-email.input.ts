import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SendEmailAttachmentInput {
  @Field(() => String)
  id: string;

  @Field(() => String)
  name: string;
}

@InputType()
export class SendEmailInput {
  @Field(() => String)
  connectedAccountId: string;

  @Field(() => String)
  to: string;

  @Field(() => String, { nullable: true })
  cc?: string;

  @Field(() => String, { nullable: true })
  bcc?: string;

  @Field(() => String)
  subject: string;

  @Field(() => String)
  body: string;

  @Field(() => String, { nullable: true })
  inReplyTo?: string;

  @Field(() => [SendEmailAttachmentInput], { nullable: true })
  files?: SendEmailAttachmentInput[];

  @Field(() => String, { nullable: true })
  scheduledAt?: string;

  // NOTE: there is deliberately no `signature` field. The signature is resolved
  // server-side from the sender's stored preference — see EmailSignatureService.
  // Accepting it from the client made the signature whatever that browser held.

  @Field(() => Boolean, { nullable: true, defaultValue: true })
  trackEmail?: boolean;
}
