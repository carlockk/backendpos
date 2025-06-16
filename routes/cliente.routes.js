const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Cliente = require('../models/Cliente');

// Registro de cliente
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, direccion, telefono } = req.body;

    // Verificar si ya existe el cliente
    const existing = await Cliente.findOne({ email });
    if (existing) {
      return res.status(400).json({ msg: 'El cliente ya está registrado.' });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear nuevo cliente
    const nuevoCliente = new Cliente({
      nombre,
      email,
      password: hashedPassword,
      direccion,
      telefono,
    });

    await nuevoCliente.save();
    res.status(201).json({ msg: 'Cliente registrado con éxito.', cliente: nuevoCliente });

  } catch (error) {
    res.status(500).json({ msg: 'Error al registrar cliente.', error });
  }
});

// Login de cliente
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const cliente = await Cliente.findOne({ email });
    if (!cliente) {
      return res.status(400).json({ msg: 'Email no registrado.' });
    }

    const isMatch = await bcrypt.compare(password, cliente.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Contraseña incorrecta.' });
    }

    // Aquí podrías generar un token si quieres usar JWT
    res.json({ msg: 'Login exitoso.', cliente });

  } catch (error) {
    res.status(500).json({ msg: 'Error al iniciar sesión.', error });
  }
});

module.exports = router;
