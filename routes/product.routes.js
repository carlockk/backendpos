const express = require('express');
const multer = require('multer');
const Producto = require('../models/product.model.js');
const { storage } = require('../utils/cloudinary'); // 👈 Importamos Cloudinary

const router = express.Router();
const upload = multer({ storage }); // 👈 Usamos multer con Cloudinary

// ✅ CREAR PRODUCTO
router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const imagen_url = req.file?.path || ''; // Cloudinary devuelve la URL en `path`

    let stock = null;
    if ('stock' in req.body) {
      const parsed = parseInt(req.body.stock);
      stock = (req.body.stock === '' || isNaN(parsed)) ? null : parsed;
    }

    const nuevo = new Producto({
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      precio: parseFloat(req.body.precio),
      stock,
      imagen_url,
      categoria: req.body.categoria || null
    });

    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    console.error('❌ Error al crear producto:', err);
    res.status(400).json({ error: err.message, details: err });
  }
});

// ✅ LISTAR PRODUCTOS
router.get('/', async (req, res) => {
  try {
    const productos = await Producto.find()
      .populate('categoria', 'nombre')
      .sort({ creado_en: -1 });
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// ✅ OBTENER PRODUCTO POR ID
router.get('/:id', async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id).populate('categoria', 'nombre');
    res.json(producto);
  } catch (err) {
    res.status(404).json({ error: 'Producto no encontrado' });
  }
});

// ✅ ELIMINAR PRODUCTO
router.delete('/:id', async (req, res) => {
  try {
    const producto = await Producto.findByIdAndDelete(req.params.id);
    // Opcional: podrías eliminar la imagen de Cloudinary si guardas su public_id
    res.json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ✅ EDITAR PRODUCTO
router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const actualizar = {
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      precio: parseFloat(req.body.precio),
      categoria: req.body.categoria || null,
    };

    if ('stock' in req.body) {
      const s = req.body.stock;
      const parsed = parseInt(s);
      actualizar.stock = (s === '' || s === undefined || isNaN(parsed)) ? null : parsed;
    }

    if (req.file) {
      actualizar.imagen_url = req.file.path; // Cloudinary devuelve la URL en `path`
    }

    const actualizado = await Producto.findByIdAndUpdate(req.params.id, actualizar, { new: true });
    res.json(actualizado);
  } catch (err) {
    console.error('❌ Error al editar producto:', err);
    res.status(400).json({ error: err.message, details: err });
  }
});

module.exports = router;
