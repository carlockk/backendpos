const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Cliente = require('../models/Cliente');

// Clave secreta para el token (puedes ponerla en .env)
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_para_clientes';

// Registro de cliente
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, direccion, telefono } = req.body;

    const existing = await Cliente.findOne({ email });
    if (existing) {
      return res.status(400).json({ msg: 'El cliente ya está registrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoCliente = new Cliente({
      nombre,
      email,
      password: hashedPassword,
      direccion,
      telefono,
    });

    await nuevoCliente.save();

    // Generar token
    const token = jwt.sign({ id: nuevoCliente._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      msg: 'Cliente registrado con éxito.',
      cliente: {
        _id: nuevoCliente._id,
        nombre: nuevoCliente.nombre,
        email: nuevoCliente.email,
      },
      token,
    });

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

    const token = jwt.sign({ id: cliente._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      msg: 'Login exitoso.',
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        email: cliente.email,
      },
      token,
    });

  } catch (error) {
    res.status(500).json({ msg: 'Error al iniciar sesión.', error });
  }
});

module.exports = router;
