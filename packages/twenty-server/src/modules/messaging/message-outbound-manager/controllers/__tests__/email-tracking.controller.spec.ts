import { Test, type TestingModule } from '@nestjs/testing';

import { type Response } from 'express';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { EmailTrackingController } from 'src/modules/messaging/message-outbound-manager/controllers/email-tracking.controller';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const TARGET = 'https://example.com/landing?a=1';

const createResponse = () => {
  const response = {
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    redirectedTo: undefined as string | undefined,
    statusCode: undefined as number | undefined,
  };

  return Object.assign(response, {
    set: jest.fn((headers: Record<string, string>) => {
      Object.assign(response.headers, headers);

      return response;
    }),
    send: jest.fn((body: unknown) => {
      response.body = body;

      return response;
    }),
    redirect: jest.fn((status: number, url: string) => {
      response.statusCode = status;
      response.redirectedTo = url;

      return response;
    }),
  }) as unknown as Response & typeof response;
};

describe('EmailTrackingController', () => {
  let controller: EmailTrackingController;
  let trackingService: EmailTrackingService;
  let repository: {
    findOne: jest.Mock;
    update: jest.Mock;
    increment: jest.Mock;
  };

  const sign = (value: string) =>
    // The controller and the email body must agree on the signature, so the
    // test derives it the same way addTracking does rather than hard-coding it.
    (trackingService as unknown as { sign: (v: string) => string }).sign(value);

  const setMessage = (message: unknown) => {
    repository.findOne.mockResolvedValue(message);
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        deliveryStatus: 'SENT',
        firstOpenedAt: null,
      }),
      update: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTrackingController],
      providers: [
        EmailTrackingService,
        {
          provide: TwentyConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'APP_SECRET'
                ? 'test-app-secret'
                : 'https://crm.example.com',
            ),
          },
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest.fn(async (fn: () => unknown) =>
              fn(),
            ),
            getRepository: jest.fn().mockResolvedValue(repository),
          },
        },
      ],
    }).compile();

    controller = module.get<EmailTrackingController>(EmailTrackingController);
    trackingService = module.get<EmailTrackingService>(EmailTrackingService);
  });

  describe('open', () => {
    it('records the open and returns a transparent gif', async () => {
      const response = createResponse();

      await controller.open(
        WORKSPACE_ID,
        MESSAGE_ID,
        sign(`${WORKSPACE_ID}:${MESSAGE_ID}:open`),
        response,
      );

      expect(response.headers['Content-Type']).toBe('image/gif');
      expect(response.headers['Cache-Control']).toContain('no-store');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(repository.increment).toHaveBeenCalledWith(
        { id: MESSAGE_ID },
        'openCount',
        1,
      );
    });

    it('rejects a missing signature without touching the record', async () => {
      await expect(
        controller.open(WORKSPACE_ID, MESSAGE_ID, undefined, createResponse()),
      ).rejects.toThrow('Invalid tracking signature');

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a signature minted for another message', async () => {
      await expect(
        controller.open(
          WORKSPACE_ID,
          MESSAGE_ID,
          sign(`${WORKSPACE_ID}:${OTHER_MESSAGE_ID}:open`),
          createResponse(),
        ),
      ).rejects.toThrow('Invalid tracking signature');
    });

    it('rejects a click signature replayed against the open endpoint', async () => {
      await expect(
        controller.open(
          WORKSPACE_ID,
          MESSAGE_ID,
          sign(`${WORKSPACE_ID}:${MESSAGE_ID}:click:${TARGET}`),
          createResponse(),
        ),
      ).rejects.toThrow('Invalid tracking signature');
    });

    it('does not downgrade a clicked message back to opened', async () => {
      setMessage({
        id: MESSAGE_ID,
        deliveryStatus: 'CLICKED',
        firstOpenedAt: new Date('2026-01-01'),
      });

      await controller.open(
        WORKSPACE_ID,
        MESSAGE_ID,
        sign(`${WORKSPACE_ID}:${MESSAGE_ID}:open`),
        createResponse(),
      );

      expect(repository.update).toHaveBeenCalledWith(
        MESSAGE_ID,
        expect.objectContaining({ deliveryStatus: 'CLICKED' }),
      );
    });

    it('keeps the original firstOpenedAt on a later open', async () => {
      const firstOpenedAt = new Date('2026-01-01T00:00:00.000Z');

      setMessage({ id: MESSAGE_ID, deliveryStatus: 'OPENED', firstOpenedAt });

      await controller.open(
        WORKSPACE_ID,
        MESSAGE_ID,
        sign(`${WORKSPACE_ID}:${MESSAGE_ID}:open`),
        createResponse(),
      );

      expect(repository.update).toHaveBeenCalledWith(
        MESSAGE_ID,
        expect.objectContaining({ firstOpenedAt }),
      );
    });
  });

  describe('click', () => {
    const validSignature = () =>
      sign(`${WORKSPACE_ID}:${MESSAGE_ID}:click:${TARGET}`);

    it('redirects to the signed target and records the click', async () => {
      const response = createResponse();

      await controller.click(
        WORKSPACE_ID,
        MESSAGE_ID,
        TARGET,
        validSignature(),
        response,
      );

      expect(response.redirect).toHaveBeenCalledWith(302, TARGET);
      expect(repository.update).toHaveBeenCalledWith(
        MESSAGE_ID,
        expect.objectContaining({ deliveryStatus: 'CLICKED' }),
      );
    });

    /**
     * The signature covers the destination, so a link legitimately received in
     * one email cannot be rewritten into an open redirect off this domain.
     */
    it('will not redirect elsewhere using a signature issued for another url', async () => {
      await expect(
        controller.click(
          WORKSPACE_ID,
          MESSAGE_ID,
          'https://evil.test/',
          validSignature(),
          createResponse(),
        ),
      ).rejects.toThrow('Invalid tracking signature');
    });

    it.each([
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,<script>alert(1)</script>'],
    ])('rejects a %s target even when correctly signed', async (_, url) => {
      await expect(
        controller.click(
          WORKSPACE_ID,
          MESSAGE_ID,
          url,
          sign(`${WORKSPACE_ID}:${MESSAGE_ID}:click:${url}`),
          createResponse(),
        ),
      ).rejects.toThrow('Invalid redirect protocol');
    });

    it('rejects a malformed url', async () => {
      await expect(
        controller.click(
          WORKSPACE_ID,
          MESSAGE_ID,
          'not a url',
          'anything',
          createResponse(),
        ),
      ).rejects.toThrow('Invalid redirect URL');
    });

    it('records nothing when the signature does not verify', async () => {
      await expect(
        controller.click(
          WORKSPACE_ID,
          MESSAGE_ID,
          TARGET,
          'forged',
          createResponse(),
        ),
      ).rejects.toThrow('Invalid tracking signature');

      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.increment).not.toHaveBeenCalled();
    });

    it('404s when the tracked message no longer exists', async () => {
      setMessage(null);

      await expect(
        controller.click(
          WORKSPACE_ID,
          MESSAGE_ID,
          TARGET,
          validSignature(),
          createResponse(),
        ),
      ).rejects.toThrow('Tracked email not found');
    });
  });
});
