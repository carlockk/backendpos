const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/**
 * @swagger
 * /pagos/crear-sesion:
 *   post:
 *     summary: Crea una sesión de pago con Stripe
 *     tags: [Pagos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: Producto A
 *                     precio:
 *                       type: number
 *                       example: 1000
 *                     cantidad:
 *                       type: integer
 *                       example: 2
 *     responses:
 *       200:
 *         description: URL de sesión de pago creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   example: https://checkout.stripe.com/...
 *       500:
 *         description: Error al crear sesión de pago
 */
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
