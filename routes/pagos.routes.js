const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Ruta para crear sesión de Stripe
router.post("/crear-sesion", async (req, res) => {
  try {
    const { items } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: items.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.nombre,
          },
          unit_amount: item.precio * 100,
        },
        quantity: item.cantidad,
      })),
      success_url: process.env.STRIPE_SUCCESS_URL,
      cancel_url: process.env.STRIPE_CANCEL_URL,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("❌ Error en Stripe:", error);
    res.status(500).json({ error: "No se pudo crear sesión de pago" });
  }
});

module.exports = router;
