// twenty-shared is not published to npm, so standalone apps cannot import its
// utils. This is the same guard.
export const isDefined = <T>(
  value: T | null | undefined,
): value is NonNullable<T> => value !== undefined && value !== null;
