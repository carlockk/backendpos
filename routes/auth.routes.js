const express = require('express');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuario.model.js');
const { normalizeEmail, isValidEmail } = require('../utils/input');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Autenticación
 *   description: Endpoints para login de usuarios
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@ejemplo.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Usuario autenticado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 nombre:
 *                   type: string
 *                 rol:
 *                   type: string
 *       401:
 *         description: Usuario no encontrado o contraseña incorrecta
 */
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Credenciales inv lidas' });
  }

  const usuario = await Usuario.findOne({ email }).populate(
    'local',
    'nombre direccion telefono correo'
  );
  if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });

  let match = false;
  if (typeof usuario.password === 'string' && usuario.password.startsWith('$2')) {
    match = await bcrypt.compare(password, usuario.password);
  } else {
    match = password === usuario.password;
    if (match) {
      usuario.password = await bcrypt.hash(password, 10);
      await usuario.save();
    }
  }
  if (!match) return res.status(401).json({ error: 'Contrase¤a incorrecta' });

  res.json({
    _id: usuario._id,
    email: usuario.email,
    nombre: usuario.nombre || '',
    rol: usuario.rol,
    local: usuario.local
      ? {
          _id: usuario.local._id,
          nombre: usuario.local.nombre || '',
          direccion: usuario.local.direccion || '',
          telefono: usuario.local.telefono || '',
          correo: usuario.local.correo || ''
        }
      : null
  });
});

module.exports = router;
