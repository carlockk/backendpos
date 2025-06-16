const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

dotenv.config();

const productRoutes = require("./routes/product.routes");
const ventaRoutes = require("./routes/venta.routes");
const cajaRoutes = require("./routes/caja.routes");
const authRoutes = require("./routes/auth.routes");
const usuarioRoutes = require("./routes/usuario.routes");
const categoriaRoutes = require("./routes/categoria.routes");
const ticketRoutes = require("./routes/ticket.routes");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rutas API
app.use("/api/productos", productRoutes);
app.use("/api/ventas", ventaRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/auth", authRoutes); // ✅ Login / Registro
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/categorias", categoriaRoutes);
app.use("/api/tickets", ticketRoutes);

// Conexión MongoDB
mongoose
  .connect(process.env.MONGO_URI, { dbName: "posaildb" })
  .then(() => {
    console.log("✅ Conectado a MongoDB");
    app.listen(PORT, () =>
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
    );
  })
  .catch((err) => console.error("❌ Error MongoDB:", err));
