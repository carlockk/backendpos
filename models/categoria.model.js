const mongoose = require('mongoose');

const categoriaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  creada_en: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Categoria', categoriaSchema);
