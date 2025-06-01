const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

// Modelo interno temporal (puedes separarlo si quieres)
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

// 🟢 Guardar un ticket
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

// 🟡 Obtener todos los tickets
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ creado: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

// 🔴 Eliminar un ticket
router.delete('/:id', async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar ticket' });
  }
});

module.exports = router;
