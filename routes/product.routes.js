const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Producto = require('../models/product.model.js');
const { subirImagen, eliminarImagen } = require('../utils/cloudinary');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Guarda la imagen temporalmente en memoria

const parseStockValue = (valor, controlarStock = true) => {
  if (!controlarStock) return null;
  if (valor === undefined || valor === null || valor === '') return null;
  const numero = Number(valor);
  if (Number.isNaN(numero)) {
    throw new Error('El stock debe ser numérico');
  }
  if (numero < 0) {
    throw new Error('El stock no puede ser negativo');
  }
  return numero;
};

const normalizarVariantes = (raw) => {
  if (raw === undefined || raw === null || raw === '' || raw === '[]') {
    return [];
  }

  let parsed = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (err) {
      throw new Error('Formato de variantes inválido');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Las variantes deben ser un arreglo');
  }

  return parsed
    .map((variant) => {
      if (!variant || typeof variant !== 'object') return null;

      const nombre = sanitizeText(variant.nombre, { max: 80 });
      if (!nombre) {
        throw new Error('Cada variante debe tener un nombre');
      }

      const precio =
        variant.precio === '' || variant.precio === null || variant.precio === undefined
          ? undefined
          : Number(variant.precio);
      if (precio !== undefined && Number.isNaN(precio)) {
        throw new Error(`El precio de la variante "${nombre}" es inválido`);
      }

      const stockRaw =
        variant.stock === '' || variant.stock === null || variant.stock === undefined
          ? 0
          : Number(variant.stock);
      if (Number.isNaN(stockRaw) || stockRaw < 0) {
        throw new Error(`El stock de la variante "${nombre}" es inválido`);
      }

      return {
        _id: variant._id && String(variant._id).length ? variant._id : undefined,
        nombre,
        color: sanitizeOptionalText(variant.color, { max: 40 }) || undefined,
        talla: sanitizeOptionalText(variant.talla, { max: 40 }) || undefined,
        precio: precio !== undefined ? precio : undefined,
        stock: stockRaw,
        sku: sanitizeOptionalText(variant.sku, { max: 40 }) || undefined
      };
    })
    .filter(Boolean);
};

const calcularStockTotal = (variantes, stockBase) => {
  if (Array.isArray(variantes) && variantes.length > 0) {
    return variantes.reduce((acc, variante) => acc + (variante.stock || 0), 0);
  }
  return stockBase;
};

router.get('/', async (_req, res) => {
  try {
    const productos = await Producto.find()
      .populate('categoria', 'nombre')
      .sort({ creado_en: -1 });
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id).populate(
      'categoria',
      'nombre'
    );
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    let imagen_url = '';
    let cloudinary_id = '';

    if (req.file) {
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    }

    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    if (!nombre) {
      throw new Error('El nombre del producto es requerido');
    }

    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';

    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    if (!nombre) {
      throw new Error('El nombre del producto es requerido');
    }

    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';

    const precio = Number(req.body.precio);
    if (Number.isNaN(precio)) {
      throw new Error('El precio es inválido');
    }

    const controlarStock = String(req.body.controlarStock) === 'true';
    const stockBase = parseStockValue(req.body.stock, controlarStock);
    const variantes = normalizarVariantes(req.body.variantes);
    console.log('📦 Crear producto - req.body.variantes:', req.body.variantes);
    console.log('📦 Crear producto - variantes normalizadas:', variantes);
    const stockCalculado = calcularStockTotal(variantes, stockBase);

    const categoriaId = req.body.categoria;
    if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
      throw new Error('La categoria es invalida');
    }

    const nuevo = new Producto({
      nombre,
      descripcion,
      precio,
      stock: stockCalculado,
      variantes,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null
    });

    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    console.error('❌ Error al crear producto:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    let imagen_url = producto.imagen_url;
    let cloudinary_id = producto.cloudinary_id;

    if (req.file) {
      if (cloudinary_id) await eliminarImagen(cloudinary_id);
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    }

    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    if (!nombre) {
      throw new Error('El nombre del producto es requerido');
    }

    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';

    const precio = Number(req.body.precio);
    if (Number.isNaN(precio)) {
      throw new Error('El precio es inválido');
    }

    const controlarStock = String(req.body.controlarStock) === 'true';
    const stockBase = parseStockValue(req.body.stock, controlarStock);
    const variantes = normalizarVariantes(req.body.variantes);
    console.log('✏️ Editar producto - req.body.variantes:', req.body.variantes);
    console.log('✏️ Editar producto - variantes normalizadas:', variantes);
    const stockCalculado = calcularStockTotal(variantes, stockBase);

    const categoriaId = req.body.categoria;
    if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
      throw new Error('La categoria es invalida');
    }

    const actualizar = {
      nombre,
      descripcion,
      precio,
      stock: stockCalculado,
      variantes,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null
    };

    const actualizado = await Producto.findByIdAndUpdate(
      req.params.id,
      actualizar,
      { new: true }
    );
    res.json(actualizado);
  } catch (err) {
    console.error('❌ Error al editar producto:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    if (producto.cloudinary_id) {
      try {
        await eliminarImagen(producto.cloudinary_id);
      } catch (error) {
        console.error('Error al eliminar imagen en Cloudinary:', error);
        return res.status(500).json({ error: 'No se pudo eliminar la imagen del producto' });
      }
    }

    await producto.deleteOne();
    res.json({ mensaje: 'Producto eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
