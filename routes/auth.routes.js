const express = require("express");
const Usuario = require("../models/usuario.model");
const bcrypt = require("bcryptjs");

const router = express.Router();

// 🔐 Login seguro
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const usuario = await Usuario.findOne({ email });
    if (!usuario) return res.status(401).json({ error: "Usuario no encontrado" });

    const match = await bcrypt.compare(password, usuario.password);
    if (!match) return res.status(401).json({ error: "Contraseña incorrecta" });

    res.json({
      _id: usuario._id,
      email: usuario.email,
      nombre: usuario.nombre || "",
      rol: usuario.rol,
    });
  } catch (err) {
    console.error("Error en /login:", err.message);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// ✅ Registro seguro
router.post("/register", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const existente = await Usuario.findOne({ email });
    if (existente) {
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const nuevoUsuario = new Usuario({
      nombre,
      email,
      password: passwordHash,
      rol: "cliente",
    });

    await nuevoUsuario.save();

    res.status(201).json({
      usuario: {
        _id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
      },
    });
  } catch (err) {
    console.error("Error en /register:", err.message);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
