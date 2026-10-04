import { Logger, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { GraphQLJSONObject } from 'graphql-type-json';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { EmailSignatureService } from 'src/modules/messaging/message-outbound-manager/services/email-signature.service';
import { OutboundEmailDispatchService } from 'src/modules/messaging/message-outbound-manager/services/outbound-email-dispatch.service';

/**
 * Read and write the signatures appended to outgoing mail.
 *
 * Signatures are per user AND per connected account, so the map returned here is
 * scoped to the caller — one user cannot read or set another's.
 */
@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
export class EmailSignatureResolver {
  private readonly logger = new Logger(EmailSignatureResolver.name);

  constructor(
    private readonly emailSignatureService: EmailSignatureService,
    private readonly outboundEmailDispatchService: OutboundEmailDispatchService,
  ) {}

  /** connectedAccountId → signature, for the current user only. */
  @Query(() => GraphQLJSONObject)
  async emailSignatures(
    @AuthUser() user: UserEntity,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<Record<string, string>> {
    return await this.emailSignatureService.getForUser({
      userId: user.id,
      workspaceId: workspace.id,
    });
  }

  /**
   * Save one account's signature; pass an empty string to clear it.
   *
   * Ownership of the connected account is verified first — without it a user
   * could store a signature keyed to somebody else's mailbox, which would then
   * be appended to that person's outgoing mail.
   */
  @Mutation(() => GraphQLJSONObject)
  async updateEmailSignature(
    @Args('connectedAccountId') connectedAccountId: string,
    @Args('signature') signature: string,
    @AuthUser() user: UserEntity,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<Record<string, string>> {
    await this.outboundEmailDispatchService.assertCanSendFrom({
      connectedAccountId,
      userWorkspaceId,
      workspaceId: workspace.id,
    });

    return await this.emailSignatureService.setForConnectedAccount({
      userId: user.id,
      workspaceId: workspace.id,
      connectedAccountId,
      signature,
    });
  }
}
