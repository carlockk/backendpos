const mongoose = require('mongoose');

const localSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  direccion: { type: String, trim: true },
  telefono: { type: String, trim: true },
  correo: { type: String, trim: true },
  servicios: {
    tienda: { type: Boolean, default: true },
    retiro: { type: Boolean, default: true },
    delivery: { type: Boolean, default: true },
  },
  pagos_web: {
    efectivo: { type: Boolean, default: true },
    tarjeta: { type: Boolean, default: true },
  },
  creado_en: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Local', localSchema);
