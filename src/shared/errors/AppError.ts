/** Error de aplicacion con codigo estable para distinguir fallos esperados del dominio. */
export class AppError extends Error {
  constructor(
    /** Mensaje seguro para mostrar al usuario o transportar por IPC. */
    message: string,
    /** Codigo tecnico usado por servicios y pruebas para clasificar el error. */
    public readonly code = 'APP_ERROR',
    /** Datos adicionales serializables para auditoria o diagnostico. */
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}
