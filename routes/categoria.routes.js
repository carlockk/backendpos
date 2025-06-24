const express = require('express');
const Categoria = require('../models/categoria.model.js');

const router = express.Router();

// ✅ Obtener todas las categorías
router.get('/', async (req, res) => {
  try {
    const categorias = await Categoria.find().sort({ nombre: 1 });
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ✅ Obtener una categoría por ID
router.get('/:id', async (req, res) => {
  try {
    const categoria = await Categoria.findById(req.params.id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(categoria);
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar la categoría' });
  }
});

// ✅ Crear nueva categoría
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const existe = await Categoria.findOne({ nombre: nombre.trim() });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe esa categoría' });
    }

    const nueva = new Categoria({
      nombre: nombre.trim(),
      descripcion: descripcion?.trim() || ""
    });

    const guardada = await nueva.save();
    res.status(201).json(guardada);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

module.exports = router;
