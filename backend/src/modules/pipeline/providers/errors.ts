export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: 'validation' | 'auth' | 'rate_limit' | 'transient' | 'unknown' = 'unknown',
    public readonly statusCode?: number
  ) {
    super(message);
  }
}

export class ProviderValidationError extends ProviderError {
  constructor(message: string, statusCode = 400) {
    super(message, 'validation', statusCode);
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(message: string, statusCode = 401) {
    super(message, 'auth', statusCode);
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(message: string, statusCode = 429) {
    super(message, 'rate_limit', statusCode);
  }
}

export class ProviderTransientError extends ProviderError {
  constructor(message: string, statusCode?: number) {
    super(message, 'transient', statusCode);
  }
}
