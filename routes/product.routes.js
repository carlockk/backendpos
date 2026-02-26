const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const ProductoBase = require('../models/productBase.model.js');
const ProductoLocal = require('../models/productLocal.model.js');
const Categoria = require('../models/categoria.model.js');
const Agregado = require('../models/agregado.model');
const { subirImagen, eliminarImagen } = require('../utils/cloudinary');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Guarda la imagen temporalmente en memoria
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeCategoriaId = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    return trimmed;
  }
  return raw;
};

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
        baseVarianteId:
          variant.baseVarianteId && String(variant.baseVarianteId).length
            ? String(variant.baseVarianteId)
            : undefined,
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

const parseObjectIdArray = (raw) => {
  let parsed = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return Array.from(
    new Set(
      parsed
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  );
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
    agregados: Array.isArray(productoLocal.agregados)
      ? productoLocal.agregados.map((agg) => {
          if (agg && typeof agg === 'object' && agg._id) {
            return {
              _id: agg._id,
              nombre: agg.nombre,
              precio: typeof agg.precio === 'number' ? agg.precio : null,
              activo: agg.activo !== false,
              grupo: agg.grupo || null
            };
          }
          return agg;
        })
      : [],
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

    const categoriaId = normalizeCategoriaId(req.body.categoria);
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
      .populate({
        path: 'agregados',
        select: 'nombre precio activo grupo',
        populate: { path: 'grupo', select: 'titulo' }
      })
      .sort({ creado_en: -1 });

    return res.json(locales.map(proyectarProductoLocal));
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
    }).populate({
      path: 'agregados',
      select: 'nombre precio activo grupo',
      populate: { path: 'grupo', select: 'titulo' }
    });
    if (productoLocal) {
      return res.json(proyectarProductoLocal(productoLocal));
    }
    return res.status(404).json({ error: 'Producto no encontrado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    let imagen_url = '';
    let cloudinary_id = '';
    const imagenUrlBody = sanitizeOptionalText(req.body.imagen_url, { max: 600 }) || '';

    if (req.file) {
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    } else if (req.body.imagen_url !== undefined) {
      if (imagenUrlBody && !isValidHttpUrl(imagenUrlBody)) {
        throw new Error('La URL de imagen es invalida');
      }
      imagen_url = imagenUrlBody;
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
    const variantesRaw = normalizarVariantes(req.body.variantes);
    const agregadosRaw = parseObjectIdArray(req.body.agregados);
    const stockCalculado = calcularStockTotal(variantesRaw, stockBase);

    const categoriaId = normalizeCategoriaId(req.body.categoria);
    if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
      throw new Error('La categoria es invalida');
    }
    if (categoriaId) {
      const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
      if (!categoria) {
        throw new Error('La categoria es invalida');
      }
    }

    const filtroAgregados = {
      local: req.localId,
      activo: true,
      $or: [{ _id: { $in: agregadosRaw } }]
    };
    if (categoriaId) {
      filtroAgregados.$or.push({ categorias: categoriaId });
    }
    const agregadosValidos = await Agregado.find(filtroAgregados, '_id').lean();

    const base = new ProductoBase({
      nombre,
      descripcion,
      imagen_url,
      cloudinary_id,
      categoria: categoriaId || null,
      variantes: variantesRaw.map((v) => ({
        nombre: v.nombre,
        color: v.color,
        talla: v.talla,
        sku: v.sku
      }))
    });

    const baseGuardado = await base.save();

    const variantesLocales = variantesRaw.map((v, idx) => ({
      baseVarianteId: baseGuardado.variantes[idx]?._id,
      nombre: v.nombre,
      color: v.color,
      talla: v.talla,
      precio: v.precio,
      stock: v.stock,
      sku: v.sku
    }));

    const local = new ProductoLocal({
      productoBase: baseGuardado._id,
      local: req.localId,
      precio,
      stock: stockCalculado,
      agregados: agregadosValidos.map((a) => a._id),
      variantes: variantesLocales
    });

    const localGuardado = await local.save();
    const poblado = await localGuardado.populate([
      {
        path: 'productoBase',
        populate: { path: 'categoria', select: 'nombre parent' }
      },
      {
        path: 'agregados',
        select: 'nombre precio activo grupo',
        populate: { path: 'grupo', select: 'titulo' }
      }
    ]);

    res.status(201).json(proyectarProductoLocal(poblado));
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
      const imagenUrlBody = sanitizeOptionalText(req.body.imagen_url, { max: 600 }) || '';

      if (req.file) {
        if (cloudinary_id) await eliminarImagen(cloudinary_id);
        const subida = await subirImagen(req.file);
        imagen_url = subida.secure_url;
        cloudinary_id = subida.public_id;
      } else if (req.body.imagen_url !== undefined) {
        if (imagenUrlBody && !isValidHttpUrl(imagenUrlBody)) {
          throw new Error('La URL de imagen es invalida');
        }
        if (cloudinary_id) {
          await eliminarImagen(cloudinary_id);
          cloudinary_id = '';
        }
        imagen_url = imagenUrlBody;
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
      const variantesRaw = normalizarVariantes(req.body.variantes);
      const agregadosRaw = parseObjectIdArray(req.body.agregados);
      const baseActuales = Array.isArray(productoLocal.productoBase?.variantes)
        ? productoLocal.productoBase.variantes
        : [];
      const basePorId = new Map(baseActuales.map((b) => [String(b._id), b]));

      const variantesBaseActualizadas = variantesRaw.map((v) => {
        const refId = v.baseVarianteId || v._id;
        const baseExistente = refId ? basePorId.get(String(refId)) : null;

        return {
          _id: baseExistente?._id || new mongoose.Types.ObjectId(),
          nombre: v.nombre,
          color: v.color,
          talla: v.talla,
          sku: v.sku
        };
      });

      const variantes = variantesRaw.map((v, idx) => ({
        baseVarianteId: variantesBaseActualizadas[idx]._id,
        nombre: v.nombre,
        color: v.color,
        talla: v.talla,
        precio: v.precio,
        stock: v.stock,
        sku: v.sku
      }));
      const stockCalculado = calcularStockTotal(variantes, stockBase);
      let categoriaId = normalizeCategoriaId(req.body.categoria);
      if (categoriaId && !mongoose.Types.ObjectId.isValid(categoriaId)) {
        categoriaId = null;
      }
      if (categoriaId) {
        const categoria = await Categoria.findOne({ _id: categoriaId, local: req.localId });
        if (!categoria) {
          throw new Error('La categoria es invalida');
        }
      }

      const filtroAgregados = {
        local: req.localId,
        activo: true,
        $or: [{ _id: { $in: agregadosRaw } }]
      };
      if (categoriaId) {
        filtroAgregados.$or.push({ categorias: categoriaId });
      }
      const agregadosValidos = await Agregado.find(filtroAgregados, '_id').lean();

      if (productoLocal.productoBase) {
        productoLocal.productoBase.nombre = nombre;
        productoLocal.productoBase.descripcion = descripcion;
        productoLocal.productoBase.categoria = categoriaId || null;
        productoLocal.productoBase.imagen_url = imagen_url;
        productoLocal.productoBase.cloudinary_id = cloudinary_id;
        productoLocal.productoBase.variantes = variantesBaseActualizadas;
        await productoLocal.productoBase.save();
      }

      productoLocal.precio = precio;
      productoLocal.stock = stockCalculado;
      productoLocal.agregados = agregadosValidos.map((a) => a._id);
      productoLocal.variantes = variantes;

      const actualizado = await productoLocal.save();
      const poblado = await actualizado.populate([
        {
          path: 'productoBase',
          populate: { path: 'categoria', select: 'nombre parent' }
        },
        {
          path: 'agregados',
          select: 'nombre precio activo grupo',
          populate: { path: 'grupo', select: 'titulo' }
        }
      ]);
      return res.json(proyectarProductoLocal(poblado));
    }

    return res.status(404).json({ error: 'Producto no encontrado' });
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

    return res.status(404).json({ error: 'Producto no encontrado' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
