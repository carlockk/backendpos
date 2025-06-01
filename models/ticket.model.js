import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  nombre: String,
  productos: [
    {
      productoId: mongoose.Schema.Types.ObjectId,
      nombre: String,
      precio_unitario: Number,
      cantidad: Number,
      observacion: String
    }
  ],
  total: Number,
  creado: {
    type: Date,
    default: () => new Date()
  }
});

export default mongoose.model('Ticket', ticketSchema);
