const express = require('express');
const multer = require('multer');
const SocialConfig = require('../models/socialConfig.model');
const { sanitizeOptionalText } = require('../utils/input');
const { subirImagen, eliminarImagen } = require('../utils/cloudinary');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.put('/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const config = await obtenerConfig(req.localId);
    const removeLogo = String(req.body?.remove_logo) === 'true';
    const logoUrl = sanitizeOptionalText(req.body?.logo_url, { max: 300 }) || '';

    if (logoUrl && !isValidUrl(logoUrl)) {
      return res.status(400).json({ error: 'URL invalida para el logo' });
    }

    if (removeLogo) {
      if (config.logo_cloudinary_id) {
        await eliminarImagen(config.logo_cloudinary_id);
      }
      config.logo_cloudinary_id = '';
      config.logo_url = '';
    }

    if (logoUrl) {
      if (config.logo_cloudinary_id) {
        await eliminarImagen(config.logo_cloudinary_id);
      }
      config.logo_cloudinary_id = '';
      config.logo_url = logoUrl;
    }

    if (req.file) {
      if (config.logo_cloudinary_id) {
        await eliminarImagen(config.logo_cloudinary_id);
      }
      const subida = await subirImagen(req.file);
      config.logo_url = subida.secure_url;
      config.logo_cloudinary_id = subida.public_id;
    }

    config.actualizado_en = new Date();
    const actualizado = await config.save();
    res.json({
      logo_url: actualizado.logo_url || '',
      logo_cloudinary_id: actualizado.logo_cloudinary_id || '',
      actualizado_en: actualizado.actualizado_en || null
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al guardar logo web cliente' });
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

    res.json({
      socials,
      logo_url: config.logo_url || '',
      actualizado_en: config.actualizado_en || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener redes sociales' });
  }
});

module.exports = router;
