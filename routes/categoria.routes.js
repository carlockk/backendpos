const express = require('express');
const Categoria = require('../models/categoria.model.js');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');

const router = express.Router();

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
    const categorias = await Categoria.find().sort({ nombre: 1 });
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
    const categoria = await Categoria.findById(req.params.id);
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

    if (!nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const existe = await Categoria.findOne({ nombre });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe esa categoría' });
    }

    const nueva = new Categoria({
      nombre,
      descripcion: descripcion || ""
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

    if (!nombre) {
      return res.status(400).json({ error: 'Nombre requerido' });
    }

    const categoria = await Categoria.findById(req.params.id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const existe = await Categoria.findOne({ nombre, _id: { $ne: req.params.id } });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre' });
    }

    categoria.nombre = nombre;
    categoria.descripcion = descripcion || "";

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
    const categoria = await Categoria.findById(req.params.id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    await Categoria.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Categoría eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

module.exports = router;
