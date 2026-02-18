const express = require('express');
const SocialConfig = require('../models/socialConfig.model');
const { sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();

router.use(adjuntarScopeLocal);
router.use(requiereLocal);

const NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'whatsapp'];

const emptySocial = () => ({ enabled: false, url: '' });

const isValidUrl = (value) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const obtenerConfig = async (localId) => {
  let config = await SocialConfig.findOne({ local: localId });
  if (!config) {
    config = await SocialConfig.create({ local: localId });
  }
  return config;
};

router.get('/', async (req, res) => {
  try {
    const config = await obtenerConfig(req.localId);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuracion social' });
  }
});

router.put('/', async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const config = await obtenerConfig(req.localId);
    const payload = req.body?.socials && typeof req.body.socials === 'object' ? req.body.socials : req.body;

    NETWORKS.forEach((key) => {
      const input = payload?.[key] || {};
      const enabled = Boolean(input?.enabled);
      const rawUrl = sanitizeOptionalText(input?.url, { max: 300 }) || '';

      if (enabled && rawUrl && !isValidUrl(rawUrl)) {
        throw new Error(`URL invalida para ${key}`);
      }

      config[key] = {
        enabled,
        url: rawUrl
      };
    });

    config.actualizado_en = new Date();
    const actualizado = await config.save();
    res.json(actualizado);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al guardar configuracion social' });
  }
});

router.get('/public', async (req, res) => {
  try {
    const config = await obtenerConfig(req.localId);
    const socials = {};

    NETWORKS.forEach((key) => {
      const entry = config?.[key] || emptySocial();
      socials[key] = {
        enabled: Boolean(entry.enabled),
        url: entry.url || ''
      };
    });

    res.json({ socials, actualizado_en: config.actualizado_en || null });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener redes sociales' });
  }
});

module.exports = router;
