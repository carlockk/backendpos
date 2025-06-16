const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Cliente = require('../models/Cliente');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_secreta';

// Registro
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, direccion, telefono } = req.body;

    const existe = await Cliente.findOne({ email });
    if (existe) return res.status(400).json({ msg: 'El cliente ya existe.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoCliente = new Cliente({
      nombre,
      email,
      password: hashedPassword,
      direccion,
      telefono
    });

    await nuevoCliente.save();

    const token = jwt.sign({ id: nuevoCliente._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      msg: 'Registro exitoso.',
      cliente: {
        _id: nuevoCliente._id,
        nombre: nuevoCliente.nombre,
        email: nuevoCliente.email
      },
      token
    });
  } catch (error) {
    res.status(500).json({ msg: 'Error al registrar cliente.', error });
  }
});

// Login con logs para depuración
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("📥 Email recibido:", email);
    console.log("📥 Password recibido:", password);

    const cliente = await Cliente.findOne({ email });

    if (!cliente) {
      console.log("❌ Cliente no encontrado con ese email");
      return res.status(400).json({ msg: 'Email no registrado.' });
    }

    console.log("✅ Cliente encontrado:", cliente);

    const isMatch = await bcrypt.compare(password, cliente.password);
    console.log("🔐 Comparación de password:", isMatch);

    if (!isMatch) {
      console.log("❌ Contraseña incorrecta");
      return res.status(400).json({ msg: 'Contraseña incorrecta.' });
    }

    const token = jwt.sign({ id: cliente._id }, JWT_SECRET, { expiresIn: '7d' });

    console.log("✅ Login exitoso, token generado");

    res.json({
      msg: 'Login exitoso.',
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        email: cliente.email
      },
      token
    });
  } catch (error) {
    console.error("🔥 Error al iniciar sesión:", error);
    res.status(500).json({ msg: 'Error al iniciar sesión.', error });
  }
});


module.exports = router;
