const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Gestión de tickets emitidos
 */

// Modelo interno temporal (puedes moverlo a models si prefieres)
const ticketSchema = new mongoose.Schema({
  nombre: String,
  productos: [
    {
      productoId: mongoose.Schema.Types.ObjectId,
      nombre: String,
      precio_unitario: Number,
      cantidad: Number,
      observacion: String
    }
  ],
  total: Number,
  creado: {
    type: Date,
    default: () => new Date()
  }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

/**
 * @swagger
 * /tickets:
 *   post:
 *     summary: Crear un nuevo ticket
 *     tags: [Tickets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - productos
 *               - total
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: "Mesa 4"
 *               total:
 *                 type: number
 *                 example: 123.45
 *               productos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productoId:
 *                       type: string
 *                       example: "60d...abc"
 *                     nombre:
 *                       type: string
 *                       example: "Coca Cola"
 *                     precio_unitario:
 *                       type: number
 *                       example: 1500
 *                     cantidad:
 *                       type: integer
 *                       example: 2
 *                     observacion:
 *                       type: string
 *                       example: "Sin hielo"
 *     responses:
 *       201:
 *         description: Ticket guardado
 *       400:
 *         description: Datos incompletos
 *       500:
 *         description: Error al guardar ticket
 */
router.post('/', async (req, res) => {
  const { nombre, productos, total } = req.body;

  if (!nombre || !productos || !Array.isArray(productos)) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const nuevo = new Ticket({ nombre, productos, total });
    await nuevo.save();
    res.status(201).json({ mensaje: 'Ticket guardado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar ticket' });
  }
});

/**
 * @swagger
 * /tickets:
 *   get:
 *     summary: Obtener todos los tickets
 *     tags: [Tickets]
 *     responses:
 *       200:
 *         description: Lista de tickets
 *       500:
 *         description: Error al obtener tickets
 */
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ creado: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

/**
 * @swagger
 * /tickets/{id}:
 *   delete:
 *     summary: Eliminar un ticket por ID
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del ticket a eliminar
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket eliminado
 *       500:
 *         description: Error al eliminar ticket
 */
router.delete('/:id', async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar ticket' });
  }
});

module.exports = router;
