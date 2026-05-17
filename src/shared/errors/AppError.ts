export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = 'APP_ERROR',
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}
