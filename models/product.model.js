// models/product.model.js
const mongoose = require('mongoose'); // 👈 ESTA LÍNEA ES LA QUE FALTABA

const varianteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    color: { type: String, trim: true },
    talla: { type: String, trim: true },
    precio: { type: Number },                 // opcional, si no se usa el precio del producto padre
    stock: { type: Number, default: 0 },
    sku: { type: String, trim: true }
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true },
    precio: { type: Number, required: true },
    stock: { type: Number, default: 0 },      // stock base (sin variantes) o total precalculado
    variantes: [varianteSchema],              // 👈 aquí viven las variantes
    imagen_url: { type: String },
    cloudinary_id: { type: String },
    categoria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Categoria',
      default: null
    },
    creado_en: { type: Date, default: Date.now }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual para calcular stock_total en runtime
productSchema.virtual('stock_total').get(function () {
  if (Array.isArray(this.variantes) && this.variantes.length > 0) {
    return this.variantes.reduce(
      (acc, variante) => acc + (variante.stock || 0),
      0
    );
  }
  return typeof this.stock === 'number' ? this.stock : 0;
});

module.exports = mongoose.model('Producto', productSchema);
