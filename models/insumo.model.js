const mongoose = require('mongoose');

const insumoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    unidad: { type: String, required: true, trim: true },
    stock_total: { type: Number, default: 0 },
    stock_minimo: { type: Number, default: 0 },
    alerta_vencimiento_dias: { type: Number, default: 7 },
    local: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
    creado_en: { type: Date, default: Date.now },
    actualizado_en: { type: Date, default: Date.now }
  }
);

module.exports = mongoose.model('Insumo', insumoSchema);
