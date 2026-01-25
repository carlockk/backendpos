const mongoose = require('mongoose');

const normalizarRol = (rol) =>
  typeof rol === 'string' ? rol.trim().toLowerCase() : '';

const adjuntarScopeLocal = (req, res, next) => {
  const rol = normalizarRol(req.headers['x-user-role']);
  const localRaw = req.headers['x-local-id'];
  const userRaw = req.headers['x-user-id'];

  req.userRole = rol;
  req.localId = null;
  req.userId = null;

  if (localRaw !== undefined && localRaw !== null && String(localRaw).trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(localRaw)) {
      return res.status(400).json({ error: 'Local invalido' });
    }
    req.localId = String(localRaw);
  }

  if (userRaw !== undefined && userRaw !== null && String(userRaw).trim() !== '') {
    if (!mongoose.Types.ObjectId.isValid(userRaw)) {
      return res.status(400).json({ error: 'Usuario invalido' });
    }
    req.userId = String(userRaw);
  }

  return next();
};

const requiereLocal = (req, res, next) => {
  if (!req.localId) {
    return res.status(400).json({ error: 'Local requerido' });
  }
  return next();
};

module.exports = {
  adjuntarScopeLocal,
  requiereLocal
};
