const mongoose = require('mongoose');

const insumoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    unidad: { type: String, required: true, trim: true },
    stock_total: { type: Number, default: 0 },
  stock_minimo: { type: Number, default: 0 },
  alerta_vencimiento_dias: { type: Number, default: 7 },
  last_alerta_stock_en: { type: Date, default: null },
  last_alerta_vencimiento_en: { type: Date, default: null },
  last_alerta_vencimiento_estado: { type: String, default: null },
  local: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
    categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'InsumoCategoria', default: null },
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    creado_en: { type: Date, default: Date.now },
    actualizado_en: { type: Date, default: Date.now }
  }
);

module.exports = mongoose.model('Insumo', insumoSchema);
