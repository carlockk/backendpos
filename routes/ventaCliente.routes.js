const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const VentaCliente = require("../models/ventaCliente.model");
const authMiddleware = require("../middlewares/auth");
const Cliente = require("../models/Cliente");
const {
  sanitizeText,
  sanitizeOptionalText,
  normalizeEmail,
  isValidEmail,
  toNumberOrNull
} = require("../utils/input");
const { adjuntarScopeLocal, requiereLocal } = require("../middlewares/localScope");

const ESTADOS_PEDIDO_VALIDOS = [
  "pendiente",
  "aceptado",
  "preparando",
  "listo",
  "entregado",
  "rechazado",
  "cancelado"
];

const normalizarAgregados = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((agg) => {
      const nombre = sanitizeOptionalText(agg?.nombre, { max: 80 }) || "";
      if (!nombre) return null;
      const precio = Number(agg?.precio);
      return {
        agregadoId: mongoose.Types.ObjectId.isValid(agg?.agregadoId) ? agg.agregadoId : null,
        nombre,
        precio: Number.isFinite(precio) && precio > 0 ? precio : 0
      };
    })
    .filter(Boolean);
};

const normalizarProductos = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    ...item,
    nombre: sanitizeOptionalText(item?.nombre, { max: 120 }) || "",
    observacion: sanitizeOptionalText(item?.observacion, { max: 160 }) || "",
    varianteNombre: sanitizeOptionalText(item?.varianteNombre, { max: 80 }) || "",
    agregados: normalizarAgregados(item?.agregados)
  }));
};

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
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const last = await VentaCliente.findOne().sort({ numero_pedido: -1 });
    const numero_pedido = last ? last.numero_pedido + 1 : 1;

    const productos = normalizarProductos(req.body.productos);
    const total = toNumberOrNull(req.body.total);
    const tipoPago = sanitizeText(req.body.tipo_pago, { max: 30 });
    const emailNormalizado = normalizeEmail(req.body.cliente_email);
    const clienteNombre = sanitizeOptionalText(req.body.cliente_nombre, { max: 120 }) || "";
    const clienteTelefono = sanitizeOptionalText(req.body.cliente_telefono, { max: 40 }) || "";

    if (!productos || productos.length === 0 || total === null || !tipoPago) {
      return res.status(400).json({ msg: "Datos incompletos" });
    }

    const cliente = await Cliente.findById(req.clienteId);
    let localId = cliente?.local || null;
    if (req.body.local && mongoose.Types.ObjectId.isValid(req.body.local)) {
      localId = req.body.local;
    }

    const nuevaVenta = new VentaCliente({
      numero_pedido,
      productos,
      total,
      tipo_pago: tipoPago,
      estado_pedido: "pendiente",
      historial_estados: [
        {
          estado: "pendiente",
          nota: "Pedido creado desde web",
          usuario_id: null,
          usuario_rol: "cliente",
          fecha: new Date()
        }
      ],
      cliente_id: req.clienteId,
      cliente_email: isValidEmail(emailNormalizado) ? emailNormalizado : "sin_correo",
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      local: localId
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
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const historial = await VentaCliente.find({ cliente_id: req.clienteId }).sort({ fecha: -1 });
    res.json(historial);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener historial", error });
  }
});

// Uso POS: listar pedidos web por local
router.get("/local/pedidos", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    const filtro = { local: req.localId };
    const estado = sanitizeOptionalText(req.query?.estado, { max: 30 }) || "";
    if (estado) filtro.estado_pedido = estado;

    const pedidos = await VentaCliente.find(filtro).sort({ fecha: -1 });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener pedidos del local", error });
  }
});

// Uso POS: cambiar estado de pedido web
router.patch("/local/pedidos/:id/estado", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    if (!["admin", "superadmin", "cajero"].includes(req.userRole)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const estado = sanitizeText(req.body?.estado, { max: 30 });
    const nota = sanitizeOptionalText(req.body?.nota, { max: 160 }) || "";

    if (!estado || !ESTADOS_PEDIDO_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: "Estado de pedido invalido" });
    }

    const venta = await VentaCliente.findOne({ _id: req.params.id, local: req.localId });
    if (!venta) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    venta.estado_pedido = estado;
    venta.historial_estados = Array.isArray(venta.historial_estados) ? venta.historial_estados : [];
    venta.historial_estados.push({
      estado,
      nota,
      usuario_id: req.userId || null,
      usuario_rol: req.userRole || "",
      fecha: new Date()
    });

    await venta.save();
    res.json(venta);
  } catch (error) {
    res.status(500).json({ msg: "Error al actualizar estado del pedido", error });
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
