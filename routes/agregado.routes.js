const express = require('express');
const mongoose = require('mongoose');
const Agregado = require('../models/agregado.model');
const AgregadoGrupo = require('../models/agregadoGrupo.model');
const Categoria = require('../models/categoria.model');
const ProductoLocal = require('../models/productLocal.model');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

const puedeCrearEditar = (rol) => ['admin', 'superadmin', 'cajero'].includes(rol);
const puedeEliminar = (rol) => ['admin', 'superadmin'].includes(rol);

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

router.get('/grupos', async (req, res) => {
  try {
    const grupos = await AgregadoGrupo.find({ local: req.localId }).sort({ titulo: 1 });
    res.json(grupos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener grupos de agregados' });
  }
});

router.post('/grupos', async (req, res) => {
  try {
    if (!puedeCrearEditar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const titulo = sanitizeText(req.body?.titulo, { max: 100 });
    const descripcion = sanitizeOptionalText(req.body?.descripcion, { max: 300 }) || '';
    if (!titulo) return res.status(400).json({ error: 'El titulo es obligatorio' });

    const existe = await AgregadoGrupo.findOne({ local: req.localId, titulo });
    if (existe) return res.status(400).json({ error: 'Ya existe un grupo con ese titulo' });

    const grupo = await AgregadoGrupo.create({
      titulo,
      descripcion,
      local: req.localId,
      actualizado_en: new Date()
    });
    res.status(201).json(grupo);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear grupo de agregados' });
  }
});

router.put('/grupos/:id', async (req, res) => {
  try {
    if (!puedeCrearEditar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const titulo = sanitizeText(req.body?.titulo, { max: 100 });
    const descripcion = sanitizeOptionalText(req.body?.descripcion, { max: 300 }) || '';
    if (!titulo) return res.status(400).json({ error: 'El titulo es obligatorio' });

    const grupo = await AgregadoGrupo.findOne({
      _id: req.params.id,
      local: req.localId
    });
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

    const existe = await AgregadoGrupo.findOne({
      local: req.localId,
      titulo,
      _id: { $ne: grupo._id }
    });
    if (existe) return res.status(400).json({ error: 'Ya existe un grupo con ese titulo' });

    grupo.titulo = titulo;
    grupo.descripcion = descripcion;
    grupo.actualizado_en = new Date();
    await grupo.save();
    res.json(grupo);
  } catch (error) {
    res.status(500).json({ error: 'Error al editar grupo de agregados' });
  }
});

router.delete('/grupos/:id', async (req, res) => {
  try {
    if (!puedeEliminar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const grupo = await AgregadoGrupo.findOne({
      _id: req.params.id,
      local: req.localId
    });
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });

    await Agregado.updateMany(
      { local: req.localId, grupo: grupo._id },
      { $set: { grupo: null, actualizado_en: new Date() } }
    );
    await grupo.deleteOne();
    res.json({ mensaje: 'Grupo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar grupo de agregados' });
  }
});

router.get('/', async (req, res) => {
  try {
    const agregados = await Agregado.find({ local: req.localId })
      .populate('grupo', 'titulo')
      .populate('categorias', 'nombre')
      .populate({
        path: 'productos',
        select: 'productoBase',
        populate: { path: 'productoBase', select: 'nombre' }
      })
      .sort({ nombre: 1 });
    res.json(agregados);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener agregados' });
  }
});

router.get('/opciones', async (req, res) => {
  try {
    const [grupos, agregados] = await Promise.all([
      AgregadoGrupo.find({ local: req.localId, activo: true }).sort({ titulo: 1 }).lean(),
      Agregado.find({ local: req.localId, activo: true }, 'nombre grupo precio').sort({ nombre: 1 }).lean()
    ]);
    res.json({ grupos, agregados });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener opciones de agregados' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!puedeCrearEditar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const nombre = sanitizeText(req.body?.nombre, { max: 120 });
    const descripcion = sanitizeOptionalText(req.body?.descripcion, { max: 300 }) || '';
    const precioRaw = req.body?.precio;
    const grupoIdRaw = req.body?.grupo;
    const categoriasRaw = parseObjectIdArray(req.body?.categorias);
    const productosRaw = parseObjectIdArray(req.body?.productos);

    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    let precio = null;
    if (precioRaw !== undefined && precioRaw !== null && String(precioRaw).trim() !== '') {
      const parsed = Number(precioRaw);
      if (Number.isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'El precio es invalido' });
      }
      precio = parsed;
    }

    let grupoId = null;
    if (grupoIdRaw && String(grupoIdRaw).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(grupoIdRaw)) {
        return res.status(400).json({ error: 'Grupo invalido' });
      }
      const grupoExiste = await AgregadoGrupo.findOne({ _id: grupoIdRaw, local: req.localId });
      if (!grupoExiste) return res.status(400).json({ error: 'Grupo invalido' });
      grupoId = grupoExiste._id;
    }

    const [categoriasValidas, productosValidos] = await Promise.all([
      Categoria.find({ _id: { $in: categoriasRaw }, local: req.localId }, '_id').lean(),
      ProductoLocal.find({ _id: { $in: productosRaw }, local: req.localId }, '_id').lean()
    ]);

    const agregado = await Agregado.create({
      nombre,
      descripcion,
      precio,
      grupo: grupoId,
      categorias: categoriasValidas.map((c) => c._id),
      productos: productosValidos.map((p) => p._id),
      local: req.localId,
      actualizado_en: new Date()
    });

    const poblado = await Agregado.findById(agregado._id)
      .populate('grupo', 'titulo')
      .populate('categorias', 'nombre')
      .populate({
        path: 'productos',
        select: 'productoBase',
        populate: { path: 'productoBase', select: 'nombre' }
      });
    res.status(201).json(poblado);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear agregado' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!puedeCrearEditar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const agregado = await Agregado.findOne({ _id: req.params.id, local: req.localId });
    if (!agregado) return res.status(404).json({ error: 'Agregado no encontrado' });

    const nombre = sanitizeText(req.body?.nombre, { max: 120 });
    const descripcion = sanitizeOptionalText(req.body?.descripcion, { max: 300 }) || '';
    const precioRaw = req.body?.precio;
    const grupoIdRaw = req.body?.grupo;
    const categoriasRaw = parseObjectIdArray(req.body?.categorias);
    const productosRaw = parseObjectIdArray(req.body?.productos);

    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    let precio = null;
    if (precioRaw !== undefined && precioRaw !== null && String(precioRaw).trim() !== '') {
      const parsed = Number(precioRaw);
      if (Number.isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'El precio es invalido' });
      }
      precio = parsed;
    }

    let grupoId = null;
    if (grupoIdRaw && String(grupoIdRaw).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(grupoIdRaw)) {
        return res.status(400).json({ error: 'Grupo invalido' });
      }
      const grupoExiste = await AgregadoGrupo.findOne({ _id: grupoIdRaw, local: req.localId });
      if (!grupoExiste) return res.status(400).json({ error: 'Grupo invalido' });
      grupoId = grupoExiste._id;
    }

    const [categoriasValidas, productosValidos] = await Promise.all([
      Categoria.find({ _id: { $in: categoriasRaw }, local: req.localId }, '_id').lean(),
      ProductoLocal.find({ _id: { $in: productosRaw }, local: req.localId }, '_id').lean()
    ]);

    agregado.nombre = nombre;
    agregado.descripcion = descripcion;
    agregado.precio = precio;
    agregado.grupo = grupoId;
    agregado.categorias = categoriasValidas.map((c) => c._id);
    agregado.productos = productosValidos.map((p) => p._id);
    agregado.actualizado_en = new Date();
    await agregado.save();

    const poblado = await Agregado.findById(agregado._id)
      .populate('grupo', 'titulo')
      .populate('categorias', 'nombre')
      .populate({
        path: 'productos',
        select: 'productoBase',
        populate: { path: 'productoBase', select: 'nombre' }
      });
    res.json(poblado);
  } catch (error) {
    res.status(500).json({ error: 'Error al editar agregado' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!puedeEliminar(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const agregado = await Agregado.findOne({ _id: req.params.id, local: req.localId });
    if (!agregado) return res.status(404).json({ error: 'Agregado no encontrado' });

    await ProductoLocal.updateMany(
      { local: req.localId, agregados: agregado._id },
      { $pull: { agregados: agregado._id } }
    );
    await agregado.deleteOne();
    res.json({ mensaje: 'Agregado eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar agregado' });
  }
});

module.exports = router;
