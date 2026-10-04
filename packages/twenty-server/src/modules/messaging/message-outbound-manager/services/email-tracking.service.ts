import { Injectable } from '@nestjs/common';

import crypto from 'crypto';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';

@Injectable()
export class EmailTrackingService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  private sign(value: string): string {
    return crypto
      .createHmac('sha256', this.twentyConfigService.get('APP_SECRET'))
      .update(value)
      .digest('base64url');
  }

  isValidSignature(value: string, signature: string): boolean {
    const expected = this.sign(value);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  async addTracking({
    email,
    workspaceId,
    messageId,
    signature,
    enabled,
  }: {
    email: ComposedEmail;
    workspaceId: string;
    messageId: string;
    signature?: string;
    enabled: boolean;
  }): Promise<ComposedEmail> {
    const signatureText = signature?.trim();
    const plainTextBody = signatureText
      ? `${email.plainTextBody}\n\n-- \n${signatureText}`
      : email.plainTextBody;

    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(email.sanitizedHtmlBody);
    const document = dom.window.document;

    if (signatureText) {
      const signatureElement = document.createElement('div');

      signatureElement.setAttribute(
        'style',
        'margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;color:#475569;white-space:pre-line;',
      );
      signatureElement.textContent = signatureText;
      document.body.append(signatureElement);
    }

    if (enabled) {
      const baseUrl = this.twentyConfigService
        .get('SERVER_URL')
        .replace(/\/$/, '');

      for (const link of document.querySelectorAll('a[href]')) {
        const target = link.getAttribute('href');

        if (!target || !/^https?:\/\//i.test(target)) {
          continue;
        }

        const value = `${workspaceId}:${messageId}:click:${target}`;
        const trackingUrl = new URL(
          `${baseUrl}/email-tracking/click/${workspaceId}/${messageId}`,
        );

        trackingUrl.searchParams.set('url', target);
        trackingUrl.searchParams.set('signature', this.sign(value));
        link.setAttribute('href', trackingUrl.toString());
      }

      const pixel = document.createElement('img');
      const value = `${workspaceId}:${messageId}:open`;

      pixel.src = `${baseUrl}/email-tracking/open/${workspaceId}/${messageId}.gif?signature=${this.sign(value)}`;
      pixel.width = 1;
      pixel.height = 1;
      pixel.alt = '';
      pixel.setAttribute(
        'style',
        'display:block;width:1px;height:1px;border:0;',
      );
      document.body.append(pixel);
    }

    return {
      ...email,
      plainTextBody,
      sanitizedHtmlBody: document.documentElement.outerHTML,
    };
  }
}
