// models/ventaCliente.model.js
const mongoose = require("mongoose");

const ProductoSchema = new mongoose.Schema({
  nombre: String,
  cantidad: Number,
  precio_unitario: Number,
  subtotal: Number,
});

const VentaClienteSchema = new mongoose.Schema({
  numero_pedido: Number,
  productos: [ProductoSchema],
  total: Number,
  tipo_pago: String,
  fecha: { type: Date, default: Date.now },
  cliente_id: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
  cliente_email: String,
});

module.exports = mongoose.model("VentaCliente", VentaClienteSchema);
