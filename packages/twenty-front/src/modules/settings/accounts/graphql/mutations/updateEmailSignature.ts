import { gql } from '@apollo/client';

export const UPDATE_EMAIL_SIGNATURE = gql`
  mutation UpdateEmailSignature(
    $connectedAccountId: String!
    $signature: String!
  ) {
    updateEmailSignature(
      connectedAccountId: $connectedAccountId
      signature: $signature
    )
  }
`;
