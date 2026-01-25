const mongoose = require('mongoose');

const localSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  direccion: { type: String, trim: true },
  telefono: { type: String, trim: true },
  correo: { type: String, trim: true },
  creado_en: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Local', localSchema);
