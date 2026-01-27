const express = require('express');
const mongoose = require('mongoose');
const Categoria = require('../models/categoria.model.js');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

/**
 * @swagger
 * tags:
 *   name: Categorías
 *   description: Operaciones CRUD para categorías
 */

/**
 * @swagger
 * /categorias:
 *   get:
 *     summary: Obtener todas las categorías
 *     tags: [Categorías]
 *     responses:
 *       200:
 *         description: Lista de categorías
 *       500:
 *         description: Error al obtener categorías
 */
router.get('/', async (req, res) => {
  try {
    const categorias = await Categoria.find({ local: req.localId }).sort({ nombre: 1 });
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

/**
 * @swagger
 * /categorias/{id}:
 *   get:
 *     summary: Obtener una categoría por ID
 *     tags: [Categorías]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la categoría
 *     responses:
 *       200:
 *         description: Categoría encontrada
 *       404:
 *         description: Categoría no encontrada
 *       500:
 *         description: Error en el servidor
 */
router.get('/:id', async (req, res) => {
  try {
    const categoria = await Categoria.findOne({
      _id: req.params.id,
      local: req.localId
    });
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(categoria);
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar la categoría' });
  }
});

/**
 * @swagger
 * /categorias:
 *   post:
 *     summary: Crear nueva categoría
 *     tags: [Categorías]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Bebidas
 *               descripcion:
 *                 type: string
 *                 example: Productos líquidos para consumo
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
 *       400:
 *         description: Validación fallida o ya existe
 *       500:
 *         description: Error al crear categoría
 */
router.post('/', async (req, res) => {
  try {
    const nombre = sanitizeText(req.body.nombre, { max: 60 });
    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 200 });
    const parentRaw = req.body.parent;

    if (!nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    let parentId = null;
    if (parentRaw !== undefined && parentRaw !== null && String(parentRaw).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(parentRaw)) {
        return res.status(400).json({ error: 'Categoría padre inválida' });
      }
      const parent = await Categoria.findOne({ _id: parentRaw, local: req.localId });
      if (!parent) {
        return res.status(400).json({ error: 'Categoría padre no encontrada' });
      }
      parentId = parentRaw;
    }

    const existe = await Categoria.findOne({ nombre, local: req.localId });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe esa categoría' });
    }

    const nueva = new Categoria({
      nombre,
      descripcion: descripcion || "",
      parent: parentId,
      local: req.localId
    });

    const guardada = await nueva.save();
    res.status(201).json(guardada);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

/**
 * @swagger
 * /categorias/{id}:
 *   put:
 *     summary: Editar una categoría existente
 *     tags: [Categorías]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la categoría
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Comidas
 *               descripcion:
 *                 type: string
 *                 example: Productos sólidos para consumo
 *     responses:
 *       200:
 *         description: Categoría actualizada
 *       400:
 *         description: Validación fallida o nombre duplicado
 *       404:
 *         description: Categoría no encontrada
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', async (req, res) => {
  try {
    const nombre = sanitizeText(req.body.nombre, { max: 60 });
    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 200 });
    const parentRaw = req.body.parent;

    if (!nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const categoria = await Categoria.findOne({ _id: req.params.id, local: req.localId });
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const existe = await Categoria.findOne({
      nombre,
      _id: { $ne: req.params.id },
      local: req.localId
    });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });
    }

    let parentId = null;
    if (parentRaw !== undefined) {
      if (parentRaw === null || String(parentRaw).trim() === '') {
        parentId = null;
      } else if (!mongoose.Types.ObjectId.isValid(parentRaw)) {
        return res.status(400).json({ error: 'Categoría padre inválida' });
      } else if (String(parentRaw) === String(req.params.id)) {
        return res.status(400).json({ error: 'La categoría no puede ser su propio padre' });
      } else {
        const parent = await Categoria.findOne({ _id: parentRaw, local: req.localId });
        if (!parent) {
          return res.status(400).json({ error: 'Categoría padre no encontrada' });
        }
        parentId = parentRaw;
      }
    } else {
      parentId = categoria.parent || null;
    }

    categoria.nombre = nombre;
    categoria.descripcion = descripcion || "";
    categoria.parent = parentId;

    const actualizada = await categoria.save();
    res.json(actualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

/**
 * @swagger
 * /categorias/{id}:
 *   delete:
 *     summary: Eliminar una categoría
 *     tags: [Categorías]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la categoría
 *     responses:
 *       200:
 *         description: Categoría eliminada correctamente
 *       404:
 *         description: Categoría no encontrada
 *       500:
 *         description: Error al eliminar categoría
 */
router.delete('/:id', async (req, res) => {
  try {
    const categoria = await Categoria.findOne({ _id: req.params.id, local: req.localId });
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const tieneHijas = await Categoria.exists({ parent: req.params.id, local: req.localId });
    if (tieneHijas) {
      return res.status(400).json({ error: 'No se puede eliminar una categoría con subcategorías' });
    }

    await Categoria.findOneAndDelete({ _id: req.params.id, local: req.localId });
    res.json({ mensaje: 'Categoría eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

module.exports = router;
