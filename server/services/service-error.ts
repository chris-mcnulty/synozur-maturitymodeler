export class ServiceError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ServiceError';
  }
}

export function sendServiceError(res: any, error: unknown, fallbackMessage = 'Internal server error') {
  if (error instanceof ServiceError) {
    const body: Record<string, unknown> = { error: error.message };
    if (error.details !== undefined) body.details = error.details;
    return res.status(error.statusCode).json(body);
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
}
