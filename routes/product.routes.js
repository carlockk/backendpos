const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Producto = require('../models/product.model.js');
const ProductoBase = require('../models/productBase.model.js');
const ProductoLocal = require('../models/productLocal.model.js');
const Categoria = require('../models/categoria.model.js');
const { subirImagen, eliminarImagen } = require('../utils/cloudinary');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Guarda la imagen temporalmente en memoria
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

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

const proyectarProductoLocal = (productoLocal) => {
  const base = productoLocal?.productoBase || {};
  return {
    _id: productoLocal._id,
    local: productoLocal.local,
    activo: productoLocal.activo,
    precio: productoLocal.precio,
    stock: productoLocal.stock,
    stock_total: productoLocal.stock_total,
    variantes: productoLocal.variantes || [],
    creado_en: productoLocal.creado_en,
    productoBaseId: base._id || null,
    nombre: base.nombre || '',
    descripcion: base.descripcion || '',
    imagen_url: base.imagen_url || '',
    cloudinary_id: base.cloudinary_id || '',
    categoria: base.categoria || null
  };
};

router.get('/base', async (req, res) => {
  try {
    const bases = await ProductoBase.find().sort({ creado_en: -1 });
    res.json(bases);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener catalogo base' });
  }
});

router.post('/base', upload.single('imagen'), async (req, res) => {
  try {
    let imagen_url = '';
    let cloudinary_id = '';

    if (req.file) {
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    }

    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    if (!nombre) throw new Error('El nombre del producto es requerido');

    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';
    const variantes = normalizarVariantes(req.body.variantes).map((v) => ({
      nombre: v.nombre,
      color: v.color,
      talla: v.talla,
      sku: v.sku
    }));

    const categoriaId = req.body.categoria;
    if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
      throw new Error('La categoria es invalida');
    }
    if (categoriaId) {
      const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
      if (!categoria) throw new Error('La categoria es invalida');
    }

    const base = new ProductoBase({
      nombre,
      descripcion,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null,
      variantes
    });

    const guardado = await base.save();
    res.status(201).json(guardado);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al crear producto base' });
  }
});

router.post('/local/use-base/:baseId', async (req, res) => {
  try {
    const { baseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(baseId)) {
      return res.status(400).json({ error: 'Producto base invalido' });
    }

    const base = await ProductoBase.findById(baseId);
    if (!base) return res.status(404).json({ error: 'Producto base no encontrado' });

    const existe = await ProductoLocal.findOne({ productoBase: baseId, local: req.localId });
    if (existe) {
      return res.status(400).json({ error: 'Ese producto ya existe en este local' });
    }

    const precio = Number(req.body?.precio);
    if (Number.isNaN(precio)) {
      return res.status(400).json({ error: 'El precio es invalido' });
    }

    const controlarStock = String(req.body?.controlarStock) === 'true';
    const stockBase = parseStockValue(req.body?.stock, controlarStock);
    const variantesLocal = normalizarVariantes(req.body?.variantes).map((v) => ({
      baseVarianteId: v._id,
      nombre: v.nombre,
      color: v.color,
      talla: v.talla,
      precio: v.precio,
      stock: v.stock,
      sku: v.sku
    }));
    const stockCalculado = calcularStockTotal(variantesLocal, stockBase);

    const local = new ProductoLocal({
      productoBase: baseId,
      local: req.localId,
      precio,
      stock: stockCalculado,
      variantes: variantesLocal
    });

    const guardado = await local.save();
    const poblado = await guardado.populate('productoBase');
    res.status(201).json(proyectarProductoLocal(poblado));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al crear producto local' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const locales = await ProductoLocal.find({ local: _req.localId })
      .populate({
        path: 'productoBase',
        populate: { path: 'categoria', select: 'nombre parent' }
      })
      .sort({ creado_en: -1 });

    if (locales.length > 0) {
      return res.json(locales.map(proyectarProductoLocal));
    }

    const productosLegacy = await Producto.find({ local: _req.localId })
      .populate('categoria', 'nombre')
      .sort({ creado_en: -1 });
    return res.json(productosLegacy);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const productoLocal = await ProductoLocal.findOne({
      _id: req.params.id,
      local: req.localId
    }).populate({
      path: 'productoBase',
      populate: { path: 'categoria', select: 'nombre parent' }
    });
    if (productoLocal) {
      return res.json(proyectarProductoLocal(productoLocal));
    }

    const productoLegacy = await Producto.findOne({
      _id: req.params.id,
      local: req.localId
    }).populate('categoria', 'nombre');
    if (!productoLegacy) return res.status(404).json({ error: 'Producto no encontrado' });

    return res.json(productoLegacy);
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
    if (categoriaId) {
      const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
      if (!categoria) {
        throw new Error('La categoria es invalida');
      }
    }

    const nuevo = new Producto({
      nombre,
      descripcion,
      precio,
      stock: stockCalculado,
      variantes,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null,
      local: req.localId
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
    const productoLocal = await ProductoLocal.findOne({
      _id: req.params.id,
      local: req.localId
    }).populate('productoBase');

    if (productoLocal) {
      let imagen_url = productoLocal.productoBase?.imagen_url || '';
      let cloudinary_id = productoLocal.productoBase?.cloudinary_id || '';

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
      const variantes = normalizarVariantes(req.body.variantes).map((v) => ({
        baseVarianteId: v._id,
        nombre: v.nombre,
        color: v.color,
        talla: v.talla,
        precio: v.precio,
        stock: v.stock,
        sku: v.sku
      }));
      const stockCalculado = calcularStockTotal(variantes, stockBase);

      const categoriaId = req.body.categoria;
      if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
        throw new Error('La categoria es invalida');
      }
      if (categoriaId) {
        const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
        if (!categoria) {
          throw new Error('La categoria es invalida');
        }
      }

      if (productoLocal.productoBase) {
        productoLocal.productoBase.nombre = nombre;
        productoLocal.productoBase.descripcion = descripcion;
        productoLocal.productoBase.categoria = categoriaId || null;
        productoLocal.productoBase.imagen_url = imagen_url;
        productoLocal.productoBase.cloudinary_id = cloudinary_id;
        await productoLocal.productoBase.save();
      }

      productoLocal.precio = precio;
      productoLocal.stock = stockCalculado;
      productoLocal.variantes = variantes;

      const actualizado = await productoLocal.save();
      const poblado = await actualizado.populate({
        path: 'productoBase',
        populate: { path: 'categoria', select: 'nombre parent' }
      });
      return res.json(proyectarProductoLocal(poblado));
    }

    const producto = await Producto.findOne({ _id: req.params.id, local: req.localId });
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
    if (categoriaId) {
      const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
      if (!categoria) {
        throw new Error('La categoria es invalida');
      }
    }

    const actualizar = {
      nombre,
      descripcion,
      precio,
      stock: stockCalculado,
      variantes,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null,
      local: req.localId
    };

    const actualizado = await Producto.findOneAndUpdate(
      { _id: req.params.id, local: req.localId },
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
    if (req.userRole === 'cajero') {
      return res.status(403).json({ error: 'No tienes permisos para eliminar productos' });
    }

    const productoLocal = await ProductoLocal.findOne({ _id: req.params.id, local: req.localId });
    if (productoLocal) {
      await productoLocal.deleteOne();
      return res.json({ mensaje: 'Producto eliminado correctamente' });
    }

    const producto = await Producto.findOne({ _id: req.params.id, local: req.localId });
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
