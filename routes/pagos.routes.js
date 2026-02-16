const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const CheckoutSession = require("../models/checkoutSession.model");
const VentaCliente = require("../models/ventaCliente.model");
const Cliente = require("../models/Cliente");
const {
  sanitizeText,
  sanitizeOptionalText,
  normalizeEmail,
  isValidEmail,
  toNumberOrNull
} = require("../utils/input");

const JWT_SECRET = process.env.JWT_SECRET || "secreto_dev";

const normalizarItems = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const nombre = sanitizeOptionalText(item?.nombre, { max: 140 }) || "";
      const precio = toNumberOrNull(item?.precio);
      const cantidadNum = Number(item?.cantidad);
      const cantidad = Number.isFinite(cantidadNum) && cantidadNum > 0 ? Math.floor(cantidadNum) : 1;

      if (!nombre || precio === null || precio < 0) return null;

      return {
        productoId: mongoose.Types.ObjectId.isValid(item?.productoId) ? item.productoId : null,
        nombre,
        precio,
        cantidad,
        varianteId: mongoose.Types.ObjectId.isValid(item?.varianteId) ? item.varianteId : null,
        varianteNombre: sanitizeOptionalText(item?.varianteNombre, { max: 80 }) || "",
        agregados: Array.isArray(item?.agregados)
          ? item.agregados
              .map((agg) => {
                const aggNombre = sanitizeOptionalText(agg?.nombre, { max: 80 }) || "";
                if (!aggNombre) return null;
                const aggPrecio = Number(agg?.precio);
                return {
                  agregadoId: mongoose.Types.ObjectId.isValid(agg?.agregadoId) ? agg.agregadoId : null,
                  nombre: aggNombre,
                  precio: Number.isFinite(aggPrecio) && aggPrecio > 0 ? aggPrecio : 0
                };
              })
              .filter(Boolean)
          : []
      };
    })
    .filter(Boolean);
};

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

const appendSessionId = (url = "") => {
  if (!url) return "";
  if (url.includes("{CHECKOUT_SESSION_ID}")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

const crearVentaClienteDesdeCheckout = async (sessionId) => {
  const pending = await CheckoutSession.findOne({ session_id: sessionId });
  if (!pending) return null;

  if (pending.venta_cliente_id) {
    const existente = await VentaCliente.findById(pending.venta_cliente_id);
    if (existente) return existente;
  }

  const last = await VentaCliente.findOne().sort({ numero_pedido: -1 });
  const numero_pedido = last ? last.numero_pedido + 1 : 1;

  const productos = (pending.productos || []).map((item) => {
    const precioUnitario = Number(item.precio || 0);
    const cantidad = Number(item.cantidad || 1);
    return {
      nombre: item.nombre,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: precioUnitario * cantidad,
      varianteId: item.varianteId || null,
      varianteNombre: item.varianteNombre || "",
      agregados: Array.isArray(item.agregados) ? item.agregados : [],
      observacion: `Pago online confirmado` 
    };
  });

  const venta = await VentaCliente.create({
    numero_pedido,
    productos,
    total: pending.total,
    tipo_pago: pending.tipo_pago || "online",
    estado_pedido: "pendiente",
    historial_estados: [
      {
        estado: "pendiente",
        nota: "Pedido web pagado en Stripe",
        usuario_id: null,
        usuario_rol: "cliente",
        fecha: new Date()
      }
    ],
    local: pending.local,
    cliente_id: pending.cliente_id || null,
    cliente_email: pending.cliente_email || "sin_correo",
    cliente_nombre: pending.cliente_nombre || "",
    cliente_telefono: pending.cliente_telefono || ""
  });

  pending.venta_cliente_id = venta._id;
  pending.estado = "procesado";
  await pending.save();

  return venta;
};

router.post("/crear-sesion", async (req, res) => {
  try {
    const order = req.body?.order || {};
    const items = normalizarItems(order.items);
    const localId = order.local;

    if (!mongoose.Types.ObjectId.isValid(localId)) {
      return res.status(400).json({ error: "Local invalido" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No hay productos para pagar" });
    }

    const clienteNombre = sanitizeText(order?.cliente?.nombre, { max: 120 });
    const clienteTelefono = sanitizeText(order?.cliente?.telefono, { max: 40 });
    const clienteCorreoRaw = normalizeEmail(order?.cliente?.correo || "");

    if (!clienteNombre || !clienteTelefono) {
      return res.status(400).json({ error: "Nombre y telefono son obligatorios" });
    }

    const total = items.reduce((sum, item) => sum + Number(item.precio || 0) * Number(item.cantidad || 1), 0);
    const tipoPedido = sanitizeOptionalText(order?.tipo_pedido, { max: 30 }) || "tienda";

    const clienteId = obtenerClienteIdDesdeToken(req);
    const cliente = clienteId ? await Cliente.findById(clienteId) : null;
    const emailCliente = normalizeEmail(cliente?.email || "");
    const emailFinal = isValidEmail(clienteCorreoRaw)
      ? clienteCorreoRaw
      : isValidEmail(emailCliente)
      ? emailCliente
      : "sin_correo";

    const successUrl = appendSessionId(process.env.STRIPE_SUCCESS_URL);
    const cancelUrl = process.env.STRIPE_CANCEL_URL;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: items.map((item) => ({
        price_data: {
          currency: "clp",
          product_data: {
            name: item.nombre,
          },
          unit_amount: Math.round(Number(item.precio)),
        },
        quantity: item.cantidad,
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        local: String(localId),
        tipo_pedido: tipoPedido,
        cliente_nombre: clienteNombre,
        cliente_telefono: clienteTelefono,
        cliente_email: emailFinal,
        cliente_id: clienteId ? String(clienteId) : ""
      },
    });

    await CheckoutSession.create({
      session_id: session.id,
      local: localId,
      cliente_id: clienteId || null,
      cliente_email: emailFinal,
      cliente_nombre: clienteNombre,
      cliente_telefono: clienteTelefono,
      tipo_pedido: tipoPedido,
      tipo_pago: "tarjeta_online",
      total,
      productos: items,
      estado: "pendiente_pago"
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error("Error en Stripe:", error);
    res.status(500).json({ error: "No se pudo crear sesion de pago" });
  }
});

router.post("/confirmar-sesion", async (req, res) => {
  try {
    const sessionId = sanitizeText(req.body?.session_id, { max: 120 });
    if (!sessionId) {
      return res.status(400).json({ error: "session_id requerido" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ error: "La sesion aun no esta pagada" });
    }

    const venta = await crearVentaClienteDesdeCheckout(sessionId);
    if (!venta) {
      return res.status(404).json({ error: "No se encontro sesion pendiente" });
    }

    res.json({
      ok: true,
      venta: {
        _id: venta._id,
        numero_pedido: venta.numero_pedido,
        estado_pedido: venta.estado_pedido,
        total: venta.total,
        fecha: venta.fecha,
        local: venta.local
      }
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudo confirmar la sesion", detail: error?.message || "" });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    let event = req.body;

    const signature = req.headers["stripe-signature"];
    if (signature && process.env.STRIPE_WEBHOOK_SECRET && req.rawBody) {
      event = stripe.webhooks.constructEvent(
        Buffer.from(req.rawBody, "utf8"),
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    }

    if (event?.type === "checkout.session.completed") {
      const session = event.data?.object;
      const sessionId = session?.id;
      if (sessionId) {
        await crearVentaClienteDesdeCheckout(sessionId);
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Webhook Stripe error:", error);
    return res.status(400).json({ error: "Webhook error" });
  }
});

module.exports = router;


