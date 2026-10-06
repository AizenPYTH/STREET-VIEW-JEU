import type { ErrorCode, ErrorInfo } from '@cityguess/shared';

export class GameError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }

  toInfo(): ErrorInfo {
    return { code: this.code, message: this.message };
  }
}

export function toErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof GameError) return error.toInfo();
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return { code: 'INTERNAL', message };
}
