const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

// Cargar variables de entorno
dotenv.config();

const productRoutes = require("./routes/product.routes.js");
const ventaRoutes = require("./routes/venta.routes.js");
const cajaRoutes = require("./routes/caja.routes.js");
const authRoutes = require("./routes/auth.routes.js");
const usuarioRoutes = require("./routes/usuario.routes.js");
const categoriaRoutes = require("./routes/categoria.routes.js");
const ticketRoutes = require("./routes/ticket.routes.js");
const clienteRoutes = require("./routes/cliente.routes");
const ventaClienteRoutes = require("./routes/ventaCliente.routes");
const pagosRoutes = require('./routes/pagos.routes');


const app = express();
//const PORT = process.env.PORT || 5000;
const PORT = process.env.PORT || 5000;

// 🌍 Mostrar MONGO_URI para depuración (puedes quitarlo después)
console.log("🌍 MONGO_URI:", process.env.MONGO_URI);

// 🛡️ CORS Temporalmente Abierto para todos los orígenes
app.use(cors({ origin: "*", credentials: true }));

// Middleware para parsear JSON
app.use(express.json());

// Servir archivos estáticos (imágenes)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rutas
app.use("/api/productos", productRoutes);
app.use("/api/ventas", ventaRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/categorias", categoriaRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/ventasCliente", ventaClienteRoutes);
app.use('/api/pagos', pagosRoutes);

// Conexión a MongoDB Atlas (posaildb)
mongoose
  .connect(process.env.MONGO_URI, {
    dbName: "posaildb", // ✅ Especificar la base de datos explícitamente
    // useNewUrlParser: true, // Puedes habilitar si quieres
    // useUnifiedTopology: true // Puedes habilitar si quieres
  })
  .then(() => {
    console.log("✅ Conectado a MongoDB");
    app.listen(PORT, () =>
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ Error MongoDB:", err);
  });
