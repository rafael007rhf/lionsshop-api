export class BusinessError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not-found' | 'conflict',
    message: string,
    readonly field: 'error' | 'erro' = 'error',
  ) {
    super(message);
  }
}
