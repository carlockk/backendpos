const normalizarRol = (rol) =>
  typeof rol === 'string' ? rol.trim().toLowerCase() : '';

const restringirMesero = (req, res, next) => {
  const rol = normalizarRol(req.headers['x-user-role']);
  if (rol !== 'mesero') {
    return next();
  }

  const path = req.path || '';
  const permitido =
    path.startsWith('/api/restaurante') ||
    path === '/api/auth/login' ||
    path === '/health' ||
    path === '/';

  if (!permitido) {
    return res.status(403).json({ error: 'Acceso restringido para rol mesero' });
  }

  return next();
};

module.exports = {
  restringirMesero
};
