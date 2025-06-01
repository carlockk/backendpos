const mongoose = require('mongoose');

const cajaSchema = new mongoose.Schema({
  apertura: { type: Date, default: Date.now },
  cierre: Date,
  monto_inicial: { type: Number, required: true },
  monto_total_vendido: Number,
  monto_total_final: Number,
  desglose_por_pago: { type: Object, default: {} },
  usuario: { type: String, default: 'No registrado' }
});

module.exports = mongoose.model('Caja', cajaSchema);
