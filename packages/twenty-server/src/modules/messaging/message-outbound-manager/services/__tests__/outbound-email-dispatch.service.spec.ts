import { Test, type TestingModule } from '@nestjs/testing';

import { FileEmailAttachmentService } from 'src/engine/core-modules/file/file-email-attachment/services/file-email-attachment.service';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/services/email-composer.service';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/services/connected-account-metadata.service';
import { type SendEmailInput } from 'src/modules/messaging/message-outbound-manager/dtos/send-email.input';
import { EmailSignatureService } from 'src/modules/messaging/message-outbound-manager/services/email-signature.service';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';
import { SendEmailService } from 'src/modules/messaging/message-outbound-manager/services/send-email.service';

const WORKSPACE_ID = 'workspace-1';
const USER_ID = 'user-1';
const USER_WORKSPACE_ID = 'user-workspace-1';
const FILE_IDS = ['file-1', 'file-2'];

const buildInput = (extra: Partial<SendEmailInput> = {}): SendEmailInput =>
  ({
    connectedAccountId: 'connected-account-1',
    to: 'someone@example.com',
    subject: 'Subject',
    body: 'Body',
    files: FILE_IDS.map((id) => ({ id, name: `${id}.pdf` })),
    ...extra,
  }) as SendEmailInput;

describe('OutboundEmailDispatchService', () => {
  let service: OutboundEmailDispatchService;
  let composer: { composeEmail: jest.Mock };
  let sendEmailService: {
    sendComposedEmail: jest.Mock;
    persistSentMessage: jest.Mock;
  };
  let fileService: { deleteFiles: jest.Mock };

  const dispatch = (input = buildInput()) =>
    service.dispatch({
      input,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      userId: USER_ID,
    });

  beforeEach(async () => {
    composer = {
      composeEmail: jest.fn().mockResolvedValue({
        success: true,
        data: { plainTextBody: 'Body', sanitizedHtmlBody: '<p>Body</p>' },
      }),
    };
    sendEmailService = {
      sendComposedEmail: jest.fn().mockResolvedValue({ headerMessageId: 'h-1' }),
      persistSentMessage: jest.fn().mockResolvedValue(undefined),
    };
    fileService = { deleteFiles: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundEmailDispatchService,
        { provide: EmailComposerService, useValue: composer },
        { provide: SendEmailService, useValue: sendEmailService },
        { provide: FileEmailAttachmentService, useValue: fileService },
        {
          provide: ConnectedAccountMetadataService,
          useValue: { verifyOwnership: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EmailSignatureService,
          useValue: {
            getForConnectedAccount: jest.fn().mockResolvedValue('Sig'),
          },
        },
        {
          provide: EmailTrackingService,
          useValue: {
            addTracking: jest.fn(async ({ email }) => email),
          },
        },
      ],
    }).compile();

    service = module.get<OutboundEmailDispatchService>(
      OutboundEmailDispatchService,
    );
  });

  /**
   * Attachments are uploaded as temporary files and deleted by this service
   * once the message is away. A scheduled send runs this same path when the job
   * fires, so the files must still be there then — nothing else deletes them,
   * and nothing sweeps the EmailAttachment folder on a timer.
   */
  it('deletes the attachment files only after the message is sent', async () => {
    const result = await dispatch();

    expect(result.success).toBe(true);
    expect(sendEmailService.sendComposedEmail).toHaveBeenCalled();
    expect(fileService.deleteFiles).toHaveBeenCalledWith({
      fileIds: FILE_IDS,
      workspaceId: WORKSPACE_ID,
    });

    const sendOrder =
      sendEmailService.sendComposedEmail.mock.invocationCallOrder[0];
    const deleteOrder = fileService.deleteFiles.mock.invocationCallOrder[0];

    expect(deleteOrder).toBeGreaterThan(sendOrder);
  });

  /** A failed send is retried by the queue; the files have to survive for it. */
  it('keeps the attachment files when composing fails', async () => {
    composer.composeEmail.mockResolvedValue({
      success: false,
      output: { error: 'Invalid recipient' },
    });

    const result = await dispatch();

    expect(result.success).toBe(false);
    expect(fileService.deleteFiles).not.toHaveBeenCalled();
  });

  it('keeps the attachment files when sending throws', async () => {
    sendEmailService.sendComposedEmail.mockRejectedValue(
      new Error('smtp unavailable'),
    );

    await expect(dispatch()).rejects.toThrow('smtp unavailable');
    expect(fileService.deleteFiles).not.toHaveBeenCalled();
  });

  it('does not call the file service when there are no attachments', async () => {
    await dispatch(buildInput({ files: [] }));

    expect(fileService.deleteFiles).not.toHaveBeenCalled();
  });
});
