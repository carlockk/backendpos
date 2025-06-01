const express = require('express');
const Categoria = require('../models/categoria.model.js');

const router = express.Router();

// Obtener todas
router.get('/', async (req, res) => {
  const categorias = await Categoria.find().sort({ nombre: 1 });
  res.json(categorias);
});

// Crear nueva
router.post('/', async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const existe = await Categoria.findOne({ nombre: nombre.trim() });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe esa categoría' });
    }

    const nueva = new Categoria({ nombre: nombre.trim() });
    const guardada = await nueva.save();
    res.status(201).json(guardada);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

module.exports = router;
