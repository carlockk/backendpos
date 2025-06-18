const express = require("express");
const router = express.Router();
const VentaCliente = require("../models/ventaCliente.model");
const authMiddleware = require("../middlewares/auth"); // asegúrate de tener este middleware
const Cliente = require("../models/Cliente");

// Crear una nueva venta (checkout)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const last = await VentaCliente.findOne().sort({ numero_pedido: -1 });
    const numero_pedido = last ? last.numero_pedido + 1 : 1;

    const nuevaVenta = new VentaCliente({
      numero_pedido,
      productos: req.body.productos,
      total: req.body.total,
      tipo_pago: req.body.tipo_pago,
      cliente_id: req.clienteId,
      cliente_email: req.body.cliente_email || "sin_correo",
    });

    const ventaGuardada = await nuevaVenta.save();
    res.status(201).json(ventaGuardada);
  } catch (error) {
    res.status(500).json({ msg: "Error al registrar venta", error });
  }
});

// Historial del cliente
router.get("/", authMiddleware, async (req, res) => {
  try {
    const historial = await VentaCliente.find({ cliente_id: req.clienteId }).sort({ fecha: -1 });
    res.json(historial);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener historial", error });
  }
});

// Detalle de una venta específica
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const venta = await VentaCliente.findOne({ _id: req.params.id, cliente_id: req.clienteId });
    if (!venta) return res.status(404).json({ msg: "Venta no encontrada" });
    res.json(venta);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener venta", error });
  }
});

module.exports = router;
