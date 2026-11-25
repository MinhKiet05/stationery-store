// Spring ProblemDetail and the legacy { message } error envelope. Raw responses
// remain unknown until each field is checked; network/abort errors have no status.
export type ApiProblem = {
  type?: string; title?: string; status?: number; detail?: string;
  instance?: string; message?: string;
};

export function errorStatus(error: unknown): number | undefined {
  return error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status : undefined;
}

export function errorName(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
    ? error.name : undefined;
}

export function errorDetail(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  if ('detail' in error && typeof error.detail === 'string') return error.detail;
  if ('message' in error && typeof error.message === 'string') return error.message;
  return undefined;
}
