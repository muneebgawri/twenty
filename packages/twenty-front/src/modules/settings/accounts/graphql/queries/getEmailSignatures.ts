import { gql } from '@apollo/client';

export const GET_EMAIL_SIGNATURES = gql`
  query GetEmailSignatures {
    emailSignatures
  }
`;
