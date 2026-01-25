const mongoose = require('mongoose');

const ventaSchema = new mongoose.Schema({
  numero_pedido: Number,
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
  tipo_pago: String,
  tipo_pedido: String,
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  local: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', default: null },
  fecha: {
    type: Date,
    default: () => new Date()
  }
});

module.exports = mongoose.model('Venta', ventaSchema);
