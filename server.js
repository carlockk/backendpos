const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 🛡️ Middleware
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 📦 Rutas
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

// Swagger
const { swaggerUi, specs } = require("./swagger");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs)); // Swagger UI

// Prefijo /api para todas las rutas REST
app.use("/api/productos", productRoutes);
app.use("/api/ventas", ventaRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/categorias", categoriaRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/ventasCliente", ventaClienteRoutes);
app.use("/api/pagos", pagosRoutes);

// 🌍 Debug conexión
console.log("🌍 MONGO_URI:", process.env.MONGO_URI);

// 🔌 Conexión MongoDB
mongoose.connect(process.env.MONGO_URI, {
  dbName: "posaildb",
})
.then(() => {
  console.log("✅ Conectado a MongoDB");
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
})
.catch((err) => {
  console.error("❌ Error al conectar a MongoDB:", err);
});
