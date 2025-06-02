const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');

const productRoutes = require('./routes/product.routes.js');
const ventaRoutes = require('./routes/venta.routes.js');
const cajaRoutes = require('./routes/caja.routes.js');
const authRoutes = require('./routes/auth.routes.js');
const usuarioRoutes = require('./routes/usuario.routes.js');
const categoriaRoutes = require('./routes/categoria.routes.js');
const ticketRoutes = require('./routes/ticket.routes.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// 🛡️ CORS Temporalmente Abierto para todos los orígenes
app.use(cors({ origin: '*', credentials: true }));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/productos', productRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/tickets', ticketRoutes);

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI, {
  //useNewUrlParser: true,
  //useUnifiedTopology: true
}).then(() => {
  console.log('✅ Conectado a MongoDB');
  app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
}).catch(err => {
  console.error('❌ Error MongoDB:', err);
});
