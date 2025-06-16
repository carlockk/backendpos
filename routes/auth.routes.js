const express = require('express');
const Usuario = require('../models/usuario.model.js');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const usuario = await Usuario.findOne({ email });
  if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });

  const match = password === usuario.password;
  if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // ✅ Agregamos el nombre
  res.json({
    _id: usuario._id,
    email: usuario.email,
    nombre: usuario.nombre || '',
    rol: usuario.rol
  });
});

module.exports = router;
