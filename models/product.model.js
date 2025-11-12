const varianteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    color: { type: String, trim: true },
    talla: { type: String, trim: true },
    precio: { type: Number },
    stock: { type: Number, default: 0 },
    sku: { type: String, trim: true }
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    descripcion: String,
    precio: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    imagen_url: String,
    cloudinary_id: String,
    categoria: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Categoria',
      required: false
    },
    variantes: [varianteSchema],
    creado_en: { type: Date, default: Date.now }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

productSchema.virtual('stock_total').get(function obtenerStockTotal() {
  if (Array.isArray(this.variantes) && this.variantes.length > 0) {
    return this.variantes.reduce((acc, variante) => acc + (variante.stock || 0), 0);
  }
  return typeof this.stock === 'number' ? this.stock : 0;
});
