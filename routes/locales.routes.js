const express = require('express');
const Local = require('../models/local.model');
const { sanitizeText, sanitizeOptionalText, normalizeEmail, isValidEmail } = require('../utils/input');
const { adjuntarScopeLocal } = require('../middlewares/localScope');

const router = express.Router();
router.use(adjuntarScopeLocal);

const esAdmin = (rol) => rol === 'admin' || rol === 'superadmin';
const requireAdmin = (req, res, next) => {
  if (!esAdmin(req.userRole)) {
    return res.status(403).json({ error: 'No tienes permisos para esta accion' });
  }
  return next();
};

const construirPayload = (data) => {
  const nombre = sanitizeText(data.nombre, { max: 80 });
  const direccion = sanitizeOptionalText(data.direccion, { max: 160 });
  const telefono = sanitizeOptionalText(data.telefono, { max: 40 });
  const correoRaw = sanitizeOptionalText(data.correo, { max: 120 });
  const correo = correoRaw ? normalizeEmail(correoRaw) : '';

  return { nombre, direccion, telefono, correo };
};

router.get('/', async (_req, res) => {
  try {
    if (esAdmin(_req.userRole)) {
      const locales = await Local.find().sort({ nombre: 1 });
      return res.json(locales);
    }
    const locales = _req.localId
      ? await Local.find({ _id: _req.localId }).sort({ nombre: 1 })
      : [];
    res.json(locales);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener locales' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (
      req.userRole !== 'superadmin' &&
      (!req.localId || String(req.localId) !== String(req.params.id))
    ) {
      return res.status(403).json({ error: 'No puedes ver otro local' });
    }
    const local = await Local.findById(req.params.id);
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });
    res.json(local);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener local' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const payload = construirPayload(req.body);
    if (!payload.nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    if (payload.correo && !isValidEmail(payload.correo)) {
      return res.status(400).json({ error: 'Correo invalido' });
    }

    const existe = await Local.findOne({ nombre: payload.nombre });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe un local con ese nombre' });
    }

    const nuevo = new Local({
      nombre: payload.nombre,
      direccion: payload.direccion || '',
      telefono: payload.telefono || '',
      correo: payload.correo || ''
    });

    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear local' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (req.userRole !== 'superadmin' && String(req.localId || '') !== String(req.params.id)) {
      return res.status(403).json({ error: 'No puedes editar otro local' });
    }
    const payload = construirPayload(req.body);
    if (!payload.nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    if (payload.correo && !isValidEmail(payload.correo)) {
      return res.status(400).json({ error: 'Correo invalido' });
    }

    const local = await Local.findById(req.params.id);
    if (!local) {
      return res.status(404).json({ error: 'Local no encontrado' });
    }

    const existe = await Local.findOne({ nombre: payload.nombre, _id: { $ne: req.params.id } });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe otro local con ese nombre' });
    }

    local.nombre = payload.nombre;
    local.direccion = payload.direccion || '';
    local.telefono = payload.telefono || '';
    local.correo = payload.correo || '';

    const actualizado = await local.save();
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar local' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (req.userRole !== 'superadmin' && String(req.localId || '') !== String(req.params.id)) {
      return res.status(403).json({ error: 'No puedes eliminar otro local' });
    }
    const local = await Local.findById(req.params.id);
    if (!local) {
      return res.status(404).json({ error: 'Local no encontrado' });
    }

    await Local.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Local eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar local' });
  }
});

module.exports = router;
