const mongoose = require('mongoose');

const ventaSchema = new mongoose.Schema({
  numero_pedido: Number,
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
  tipo_pago: String,
  tipo_pedido: String,
  fecha: {
    type: Date,
    default: () => new Date()
  }
});

module.exports = mongoose.model('Venta', ventaSchema);
