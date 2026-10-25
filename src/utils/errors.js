// Error controlado: se responde al cliente con su código y mensaje.
class ApiError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const badRequest = (m) => new ApiError(400, m);
const noAutorizado = (m = 'Debes iniciar sesión.') => new ApiError(401, m);
const prohibido = (m = 'No tienes permiso para hacer esto.') => new ApiError(403, m);
const noEncontrado = (m = 'No se encontró el recurso.') => new ApiError(404, m);
const conflicto = (m) => new ApiError(409, m);

module.exports = { ApiError, badRequest, noAutorizado, prohibido, noEncontrado, conflicto };
