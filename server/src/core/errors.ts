export type ErrorCode =
  | 'E_NOT_INITIALIZED'
  | 'E_INVALID_INPUT'
  | 'E_NOT_FOUND'
  | 'E_CORRUPT'
  | 'E_LOCKED'
  | 'E_CYCLE'
  | 'E_CRITERIA_UNMET'
  | 'E_CONFIRMATION_REQUIRED'
  | 'E_CONFIRMATION_INVALID'
  | 'E_SECRET_DETECTED'
  | 'E_SCHEMA_TOO_NEW'
  | 'E_PATH'
  | 'E_CONFLICT';

/** An expected, user-facing failure. The message must tell the model what to do next. */
export class MentorError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MentorError';
    this.code = code;
    this.details = details;
  }
}

export function isMentorError(e: unknown): e is MentorError {
  return e instanceof MentorError;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
