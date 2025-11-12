const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  nombre: String,
  productos: [
    {
      productoId: mongoose.Schema.Types.ObjectId,
      nombre: String,
      precio_unitario: Number,
      cantidad: Number,
      observacion: String,
      varianteId: mongoose.Schema.Types.ObjectId,
      varianteNombre: String,
      atributos: [
        {
          nombre: String,
          valor: String
        }
      ]
    }
  ],
  total: Number,
  creado: {
    type: Date,
    default: () => new Date()
  }
});

module.exports = mongoose.model('Ticket', ticketSchema);
