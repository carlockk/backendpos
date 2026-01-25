const mongoose = require('mongoose');

const categoriaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  local: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', default: null },
  creada_en: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Categoria', categoriaSchema);
