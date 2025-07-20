const express = require("express");
const router = express.Router();
const VentaCliente = require("../models/ventaCliente.model");
const authMiddleware = require("../middlewares/auth");
const Cliente = require("../models/Cliente");

/**
 * @swagger
 * tags:
 *   name: VentasCliente
 *   description: Ventas realizadas por los clientes autenticados
 */

/**
 * @swagger
 * /ventasCliente:
 *   post:
 *     summary: Registrar una nueva venta desde el cliente
 *     tags: [VentasCliente]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productos:
 *                 type: array
 *                 items:
 *                   type: object
 *               total:
 *                 type: number
 *               tipo_pago:
 *                 type: string
 *               cliente_email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Venta registrada exitosamente
 *       500:
 *         description: Error al registrar venta
 */
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

/**
 * @swagger
 * /ventasCliente:
 *   get:
 *     summary: Obtener historial de compras del cliente autenticado
 *     tags: [VentasCliente]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ventas del cliente
 *       500:
 *         description: Error al obtener historial
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const historial = await VentaCliente.find({ cliente_id: req.clienteId }).sort({ fecha: -1 });
    res.json(historial);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener historial", error });
  }
});

/**
 * @swagger
 * /ventasCliente/{id}:
 *   get:
 *     summary: Obtener detalle de una venta específica del cliente
 *     tags: [VentasCliente]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la venta
 *     responses:
 *       200:
 *         description: Detalles de la venta
 *       404:
 *         description: Venta no encontrada
 *       500:
 *         description: Error al obtener la venta
 */
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
