// backend/models/categoria.model.js
import mongoose from 'mongoose';

const categoriaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  descripcion: { type: String, trim: true },
  creada_en: { type: Date, default: Date.now }
});

export default mongoose.model('Categoria', categoriaSchema);
