const express = require("express");
const router = express.Router();
const VentaCliente = require("../models/ventaCliente.model");
const authMiddleware = require("../middlewares/auth");
const nodemailer = require("nodemailer");

// Crear una nueva venta (checkout)
router.post("/", authMiddleware, async (req, res) => {
  try {
    // Formato de número de pedido de 4 dígitos (ej: 0001, 0002)
    const last = await VentaCliente.findOne().sort({ numero_pedido: -1 });
    let siguienteNumero = last ? last.numero_pedido + 1 : 1;
    if (siguienteNumero > 9999) siguienteNumero = 1;
    const numero_pedido = String(siguienteNumero).padStart(4, "0");

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
    console.error("❌ Error al registrar venta:", error);
    res.status(500).json({ msg: "Error al registrar venta", error });
  }
});

// Historial del cliente autenticado
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
    const venta = await VentaCliente.findOne({
      _id: req.params.id,
      cliente_id: req.clienteId,
    });

    if (!venta) return res.status(404).json({ msg: "Venta no encontrada" });
    res.json(venta);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener venta", error });
  }
});

// Enviar ticket por correo al cliente y al negocio
router.post("/enviar/:id", authMiddleware, async (req, res) => {
  try {
    const venta = await VentaCliente.findOne({
      _id: req.params.id,
      cliente_id: req.clienteId,
    });

    if (!venta) return res.status(404).json({ msg: "Venta no encontrada" });

    const clienteEmail = venta.cliente_email;
    const adminEmail = process.env.EMAIL_RECEPTOR || "ventas@ejemplo.com";

    const html = `
      <h2>🧾 Detalle de Compra #${venta.numero_pedido}</h2>
      <p><strong>Fecha:</strong> ${new Date(venta.fecha).toLocaleString()}</p>
      <p><strong>Método de Pago:</strong> ${venta.tipo_pago}</p>
      <table border="1" cellpadding="6" cellspacing="0" style="margin-top: 10px">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${venta.productos.map((p) => `
            <tr>
              <td>${p.nombre}</td>
              <td>${p.cantidad}</td>
              <td>$${p.precio_unitario}</td>
              <td>$${p.subtotal}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p><strong>Total:</strong> $${venta.total}</p>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Enviar correo al cliente
    await transporter.sendMail({
      from: `"AutoPedido" <${process.env.EMAIL_USER}>`,
      to: clienteEmail,
      subject: `Tu compra #${venta.numero_pedido}`,
      html,
    });

    // Enviar copia al negocio
    await transporter.sendMail({
      from: `"AutoPedido" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `Nueva compra #${venta.numero_pedido}`,
      html,
    });

    res.json({ msg: "Correo enviado correctamente." });
  } catch (err) {
    console.error("❌ Error al enviar correo:", err);
    res.status(500).json({ msg: "Error al enviar correo", err });
  }
});

module.exports = router;
