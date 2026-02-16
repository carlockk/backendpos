const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const router = express.Router();
const VentaCliente = require("../models/ventaCliente.model");
const PedidoEstadoConfig = require("../models/pedidoEstadoConfig.model");
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

const JWT_SECRET = process.env.JWT_SECRET || "secreto_dev";
const DEFAULT_ESTADOS_PEDIDO = [
  "pendiente",
  "aceptado",
  "preparando",
  "listo",
  "entregado",
  "rechazado",
  "cancelado"
];

const obtenerClienteIdDesdeToken = (req) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded?.id || null;
  } catch {
    return null;
  }
};

const obtenerConfigEstados = async (localId) => {
  let config = await PedidoEstadoConfig.findOne({ local: localId });
  if (!config) {
    config = await PedidoEstadoConfig.create({
      local: localId,
      estados: DEFAULT_ESTADOS_PEDIDO
    });
    return config;
  }

  if (!Array.isArray(config.estados) || config.estados.length === 0) {
    config.estados = DEFAULT_ESTADOS_PEDIDO;
    await config.save();
  }

  return config;
};

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

// Registrar pedido web (cliente logueado o invitado)
router.post("/", async (req, res) => {
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

    const clienteId = obtenerClienteIdDesdeToken(req);
    const cliente = clienteId ? await Cliente.findById(clienteId) : null;

    let localId = null;
    if (req.body.local && mongoose.Types.ObjectId.isValid(req.body.local)) {
      localId = req.body.local;
    } else if (cliente?.local) {
      localId = cliente.local;
    }

    if (!localId) {
      return res.status(400).json({ msg: "Debes seleccionar un local" });
    }

    const emailClienteModel = normalizeEmail(cliente?.email || "");
    const emailFinal = isValidEmail(emailNormalizado)
      ? emailNormalizado
      : isValidEmail(emailClienteModel)
      ? emailClienteModel
      : "sin_correo";

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
      cliente_id: clienteId || null,
      cliente_email: emailFinal,
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      local: localId
    });

    const ventaGuardada = await nuevaVenta.save();
    await obtenerConfigEstados(localId);
    res.status(201).json(ventaGuardada);
  } catch (error) {
    res.status(500).json({ msg: "Error al registrar venta", error });
  }
});

// Historial de compras del cliente autenticado
router.get("/", authMiddleware, async (req, res) => {
  try {
    const historial = await VentaCliente.find({ cliente_id: req.clienteId }).sort({ fecha: -1 });
    res.json(historial);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener historial", error });
  }
});

// Eliminar pedido propio (cliente autenticado)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const eliminado = await VentaCliente.findOneAndDelete({
      _id: req.params.id,
      cliente_id: req.clienteId
    });

    if (!eliminado) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json({ ok: true, id: eliminado._id });
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar pedido", error });
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

// Uso POS: eliminar pedido web por local (solo admin/superadmin)
router.delete("/local/pedidos/:id", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.userRole)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const eliminado = await VentaCliente.findOneAndDelete({
      _id: req.params.id,
      local: req.localId
    });

    if (!eliminado) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json({ ok: true, id: eliminado._id });
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar pedido", error });
  }
});

// Uso POS: estados configurados para pedidos web del local
router.get("/local/estados", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    const config = await obtenerConfigEstados(req.localId);
    res.json({ estados: config.estados });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener estados de pedido", error });
  }
});

// Uso POS: crear estado de pedido web (solo admin/superadmin)
router.post("/local/estados", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.userRole)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const estadoRaw = sanitizeText(req.body?.estado, { max: 30 });
    const estado = estadoRaw ? estadoRaw.toLowerCase() : "";

    if (!estado) {
      return res.status(400).json({ error: "Estado invalido" });
    }

    const config = await obtenerConfigEstados(req.localId);
    const yaExiste = config.estados.some((item) => String(item).toLowerCase() === estado);

    if (yaExiste) {
      return res.status(409).json({ error: "El estado ya existe", estados: config.estados });
    }

    config.estados.push(estado);
    await config.save();

    res.status(201).json({ estados: config.estados });
  } catch (error) {
    res.status(500).json({ msg: "Error al crear estado de pedido", error });
  }
});

// Uso POS: cambiar estado de pedido web
router.patch("/local/pedidos/:id/estado", adjuntarScopeLocal, requiereLocal, async (req, res) => {
  try {
    if (!["admin", "superadmin", "cajero"].includes(req.userRole)) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const estadoRaw = sanitizeText(req.body?.estado, { max: 30 });
    const estado = estadoRaw ? estadoRaw.toLowerCase() : "";
    const nota = sanitizeOptionalText(req.body?.nota, { max: 160 }) || "";

    if (!estado) {
      return res.status(400).json({ error: "Estado de pedido invalido" });
    }

    const config = await obtenerConfigEstados(req.localId);
    const estadoPermitido = config.estados.some((item) => String(item).toLowerCase() === estado);
    if (!estadoPermitido) {
      return res.status(400).json({ error: "Estado no configurado para este local" });
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

// Consulta publica por id de pedido (usado por historial local sin login)
router.get("/public/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "ID de pedido invalido" });
    }

    const venta = await VentaCliente.findById(req.params.id).select(
      "_id numero_pedido estado_pedido estado status fecha total tipo_pago local cliente_nombre cliente_telefono productos"
    );

    if (!venta) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json(venta);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener pedido", error });
  }
});
// Detalle de venta para cliente autenticado
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

