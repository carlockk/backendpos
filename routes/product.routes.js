const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Producto = require('../models/product.model.js');

const router = express.Router();

// 🔥 Elimina esta línea estática, ya no se necesita:
// const DOMAIN = 'https://web-production-1d6f4.up.railway.app';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/img';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombreArchivo = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, nombreArchivo);
  }
});

const upload = multer({ storage });

// ✅ CREAR PRODUCTO
router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const imagen_url = req.file
      ? `${req.protocol}://${req.get('host')}/uploads/img/${req.file.filename}`
      : '';

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
    res.status(400).json({ error: err.message });
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
    if (producto?.imagen_url?.includes('/uploads/img/')) {
      const ruta = path.join('uploads', 'img', path.basename(producto.imagen_url));
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
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
      categoria: req.body.categoria || null
    };

    if ('stock' in req.body) {
      const s = req.body.stock;
      const parsed = parseInt(s);
      if (s === '' || s === undefined || isNaN(parsed)) {
        actualizar.stock = null;
        console.log('🟠 Stock se guardará como null');
      } else {
        actualizar.stock = parsed;
        console.log('🟢 Stock actualizado a:', parsed);
      }
    }

    if (req.file) {
      if (producto.imagen_url?.includes('/uploads/img/')) {
        const rutaAnterior = path.join('uploads', 'img', path.basename(producto.imagen_url));
        if (fs.existsSync(rutaAnterior)) fs.unlinkSync(rutaAnterior);
      }
      actualizar.imagen_url = `${req.protocol}://${req.get('host')}/uploads/img/${req.file.filename}`;
    }

    const actualizado = await Producto.findByIdAndUpdate(req.params.id, actualizar, { new: true });
    res.json(actualizado);
  } catch (err) {
    console.error('❌ Error al editar producto:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
