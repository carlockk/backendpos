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

const normalizeModoSeleccion = (raw, fallback = 'multiple') => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === 'multiple' || value === 'unico') return value;
  return null;
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
    const categoriaPrincipal = sanitizeOptionalText(req.body?.categoriaPrincipal, { max: 100 }) || '';
    const descripcion = sanitizeOptionalText(req.body?.descripcion, { max: 300 }) || '';
    const modoSeleccion = normalizeModoSeleccion(req.body?.modoSeleccion, 'multiple');
    if (!titulo) return res.status(400).json({ error: 'El titulo es obligatorio' });
    if (!modoSeleccion) return res.status(400).json({ error: 'Modo de seleccion invalido' });

    const existe = await AgregadoGrupo.findOne({ local: req.localId, titulo });
    if (existe) return res.status(400).json({ error: 'Ya existe un grupo con ese titulo' });

    const grupo = await AgregadoGrupo.create({
      categoriaPrincipal,
      titulo,
      descripcion,
      modoSeleccion,
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
    const categoriaPrincipal = sanitizeOptionalText(req.body?.categoriaPrincipal, { max: 100 }) || '';
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

    const modoSeleccion = normalizeModoSeleccion(
      req.body?.modoSeleccion,
      grupo.modoSeleccion || 'multiple'
    );
    if (!modoSeleccion) return res.status(400).json({ error: 'Modo de seleccion invalido' });

    grupo.titulo = titulo;
    grupo.categoriaPrincipal = categoriaPrincipal;
    grupo.descripcion = descripcion;
    grupo.modoSeleccion = modoSeleccion;
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
      .populate('grupo', 'categoriaPrincipal titulo modoSeleccion')
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
      .populate('grupo', 'categoriaPrincipal titulo modoSeleccion')
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

router.post('/clonar', async (req, res) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'No tienes permisos para clonar agregados' });
    }

    const { sourceLocalId, agregadoId, clonarTodas } = req.body || {};
    if (!sourceLocalId || (!agregadoId && !clonarTodas)) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    if (!mongoose.Types.ObjectId.isValid(sourceLocalId)) {
      return res.status(400).json({ error: 'Local origen invalido' });
    }
    if (agregadoId && !mongoose.Types.ObjectId.isValid(agregadoId)) {
      return res.status(400).json({ error: 'Agregado invalido' });
    }
    if (String(sourceLocalId) === String(req.localId)) {
      return res.status(400).json({ error: 'El local origen y destino deben ser distintos' });
    }

    let origen = [];
    if (clonarTodas) {
      origen = await Agregado.find({ local: sourceLocalId })
        .populate('grupo', 'categoriaPrincipal titulo descripcion modoSeleccion')
        .lean();
      if (origen.length === 0) {
        return res.status(400).json({ error: 'No hay agregados para clonar' });
      }
    } else {
      const agregado = await Agregado.findOne({ _id: agregadoId, local: sourceLocalId })
        .populate('grupo', 'categoriaPrincipal titulo descripcion modoSeleccion')
        .lean();
      if (!agregado) {
        return res.status(404).json({ error: 'Agregado origen no encontrado' });
      }
      origen = [agregado];
    }

    const nombres = origen.map((a) => sanitizeText(a?.nombre, { max: 120 })).filter(Boolean);
    const existentes = await Agregado.find({
      local: req.localId,
      nombre: { $in: nombres }
    }).select('nombre').lean();
    if (existentes.length > 0) {
      return res.status(400).json({
        error: `Ya existe el agregado "${existentes[0].nombre}" en este local`
      });
    }

    const gruposOrigen = Array.from(
      new Map(
        origen
          .filter((a) => a?.grupo?.titulo)
          .map((a) => [String(a.grupo.titulo).trim(), a.grupo])
      ).values()
    );
    const titulosGrupo = gruposOrigen
      .map((g) => sanitizeText(g?.titulo, { max: 100 }))
      .filter(Boolean);
    const gruposDestinoExistentes = await AgregadoGrupo.find({
      local: req.localId,
      titulo: { $in: titulosGrupo }
    }).select('_id titulo').lean();

    const grupoPorTitulo = new Map(
      gruposDestinoExistentes.map((g) => [String(g.titulo).trim().toLowerCase(), g._id])
    );
    let gruposCreados = 0;
    for (const grupo of gruposOrigen) {
      const titulo = sanitizeText(grupo?.titulo, { max: 100 });
      if (!titulo) continue;
      const key = titulo.toLowerCase();
      if (grupoPorTitulo.has(key)) continue;
      const creado = await AgregadoGrupo.create({
        categoriaPrincipal:
          sanitizeOptionalText(grupo?.categoriaPrincipal, { max: 100 }) || '',
        titulo,
        descripcion: sanitizeOptionalText(grupo?.descripcion, { max: 300 }) || '',
        modoSeleccion: normalizeModoSeleccion(grupo?.modoSeleccion, 'multiple') || 'multiple',
        local: req.localId,
        actualizado_en: new Date()
      });
      grupoPorTitulo.set(key, creado._id);
      gruposCreados += 1;
    }

    const docs = origen.map((a) => {
      const nombre = sanitizeText(a?.nombre, { max: 120 });
      const descripcion = sanitizeOptionalText(a?.descripcion, { max: 300 }) || '';
      const grupoTitulo = sanitizeText(a?.grupo?.titulo, { max: 100 });
      const grupoId = grupoTitulo ? grupoPorTitulo.get(grupoTitulo.toLowerCase()) || null : null;
      const precio = Number.isFinite(Number(a?.precio)) ? Number(a.precio) : null;
      return {
        nombre,
        descripcion,
        precio,
        grupo: grupoId,
        categorias: [],
        productos: [],
        local: req.localId,
        actualizado_en: new Date()
      };
    });

    await Agregado.insertMany(docs);

    return res.json({
      mensaje: 'Agregados clonados correctamente',
      cantidad: docs.length,
      grupos_creados: gruposCreados
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al clonar agregados' });
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
      .populate('grupo', 'categoriaPrincipal titulo modoSeleccion')
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
