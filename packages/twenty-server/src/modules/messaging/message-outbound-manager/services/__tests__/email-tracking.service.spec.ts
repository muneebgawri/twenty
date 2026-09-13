import { Test, type TestingModule } from '@nestjs/testing';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { EmailTrackingService } from 'src/modules/messaging/message-outbound-manager/services/email-tracking.service';

const WORKSPACE_ID = 'workspace-1';
const MESSAGE_ID = 'message-1';

const composedEmail = (
  sanitizedHtmlBody: string,
  plainTextBody = 'Hello',
): ComposedEmail =>
  ({ plainTextBody, sanitizedHtmlBody }) as ComposedEmail;

describe('EmailTrackingService', () => {
  let service: EmailTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
      ],
    }).compile();

    service = module.get<EmailTrackingService>(EmailTrackingService);
  });

  describe('signatures', () => {
    it('appends the signature to the plain text part after the -- delimiter', async () => {
      const result = await service.addTracking({
        email: composedEmail('<html><body><p>Hi</p></body></html>'),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: 'Matt Marshall\nPinion Newswire',
        enabled: false,
      });

      expect(result.plainTextBody).toBe(
        'Hello\n\n-- \nMatt Marshall\nPinion Newswire',
      );
    });

    it('appends the signature to the html part', async () => {
      const result = await service.addTracking({
        email: composedEmail('<html><body><p>Hi</p></body></html>'),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: 'Matt Marshall',
        enabled: false,
      });

      expect(result.sanitizedHtmlBody).toContain('Matt Marshall');
      expect(result.sanitizedHtmlBody).toContain('white-space:pre-line');
    });

    it('leaves the body untouched when no signature is set', async () => {
      const result = await service.addTracking({
        email: composedEmail('<html><body><p>Hi</p></body></html>'),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: undefined,
        enabled: false,
      });

      expect(result.plainTextBody).toBe('Hello');
      expect(result.sanitizedHtmlBody).not.toContain('border-top');
    });

    it('treats a whitespace-only signature as none', async () => {
      const result = await service.addTracking({
        email: composedEmail('<html><body><p>Hi</p></body></html>'),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: '  \n  ',
        enabled: false,
      });

      expect(result.plainTextBody).toBe('Hello');
      expect(result.sanitizedHtmlBody).not.toContain('border-top');
    });

    it('escapes html in a signature instead of rendering it', async () => {
      const result = await service.addTracking({
        email: composedEmail('<html><body><p>Hi</p></body></html>'),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: '<img src=x onerror=alert(1)>',
        enabled: false,
      });

      expect(result.sanitizedHtmlBody).not.toContain('<img src=x');
      expect(result.sanitizedHtmlBody).toContain('&lt;img');
    });
  });

  describe('tracking', () => {
    it('adds an open pixel and rewrites absolute links when enabled', async () => {
      const result = await service.addTracking({
        email: composedEmail(
          '<html><body><a href="https://example.com/x">link</a></body></html>',
        ),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: undefined,
        enabled: true,
      });

      expect(result.sanitizedHtmlBody).toContain(
        `/email-tracking/open/${WORKSPACE_ID}/${MESSAGE_ID}.gif`,
      );
      expect(result.sanitizedHtmlBody).toContain(
        `/email-tracking/click/${WORKSPACE_ID}/${MESSAGE_ID}`,
      );
    });

    it('adds nothing when tracking is disabled', async () => {
      const result = await service.addTracking({
        email: composedEmail(
          '<html><body><a href="https://example.com/x">link</a></body></html>',
        ),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: undefined,
        enabled: false,
      });

      expect(result.sanitizedHtmlBody).not.toContain('email-tracking');
      expect(result.sanitizedHtmlBody).toContain('href="https://example.com/x"');
    });

    it('leaves mailto and relative links alone', async () => {
      const result = await service.addTracking({
        email: composedEmail(
          '<html><body><a href="mailto:a@b.co">mail</a><a href="/relative">rel</a></body></html>',
        ),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: undefined,
        enabled: true,
      });

      expect(result.sanitizedHtmlBody).toContain('href="mailto:a@b.co"');
      expect(result.sanitizedHtmlBody).toContain('href="/relative"');
    });
  });

  describe('isValidSignature', () => {
    it('accepts a signature it produced and rejects a tampered one', async () => {
      const result = await service.addTracking({
        email: composedEmail(
          '<html><body><a href="https://example.com/x">link</a></body></html>',
        ),
        workspaceId: WORKSPACE_ID,
        messageId: MESSAGE_ID,
        signature: undefined,
        enabled: true,
      });

      // The pixel's signature specifically — the click link carries its own,
      // over a different value, and appears first in the document.
      const embedded = /\.gif\?signature=([A-Za-z0-9_-]+)/.exec(
        result.sanitizedHtmlBody,
      )?.[1];

      expect(embedded).toBeDefined();

      const value = `${WORKSPACE_ID}:${MESSAGE_ID}:open`;

      expect(service.isValidSignature(value, embedded as string)).toBe(true);
      expect(
        service.isValidSignature(value, `${(embedded as string).slice(0, -1)}A`),
      ).toBe(false);
    });

    /** timingSafeEqual throws on a length mismatch, so the guard matters. */
    it('returns false rather than throwing for a wrong-length signature', () => {
      expect(() => service.isValidSignature('value', 'short')).not.toThrow();
      expect(service.isValidSignature('value', 'short')).toBe(false);
    });
  });
});
