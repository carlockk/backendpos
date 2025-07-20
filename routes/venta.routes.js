const express = require('express');
const Venta = require('../models/venta.model.js');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ventas
 *   description: Gestión de ventas del sistema POS
 */

/**
 * @swagger
 * /ventas:
 *   get:
 *     summary: Obtener historial de todas las ventas
 *     tags: [Ventas]
 *     responses:
 *       200:
 *         description: Lista de ventas ordenadas por fecha descendente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', async (req, res) => {
  try {
    const ventas = await Venta.find().sort({ fecha: -1 });
    res.json(ventas);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ error: 'Error interno al obtener historial' });
  }
});

/**
 * @swagger
 * /ventas/resumen:
 *   get:
 *     summary: Obtener resumen de ventas por fecha
 *     tags: [Ventas]
 *     parameters:
 *       - name: fecha
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-07-19"
 *     responses:
 *       200:
 *         description: Resumen con total, cantidad y pagos por tipo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 cantidad:
 *                   type: number
 *                 porTipoPago:
 *                   type: object
 *       400:
 *         description: Fecha requerida
 *       500:
 *         description: Error interno del servidor
 */
router.get('/resumen', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida' });
  }

  try {
    const inicio = new Date(`${fecha}T00:00:00`);
    const fin = new Date(`${fecha}T23:59:59.999`);

    const ventas = await Venta.find({ fecha: { $gte: inicio, $lte: fin } });

    const total = ventas.reduce((acc, v) => acc + v.total, 0);
    const cantidad = ventas.length;

    const porTipoPago = {};
    ventas.forEach(v => {
      porTipoPago[v.tipo_pago] = (porTipoPago[v.tipo_pago] || 0) + v.total;
    });

    res.json({ total, cantidad, porTipoPago });
  } catch (err) {
    console.error('Error al obtener resumen:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @swagger
 * /ventas/resumen-rango:
 *   get:
 *     summary: Obtener resumen de ventas por rango de fechas
 *     tags: [Ventas]
 *     parameters:
 *       - name: inicio
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-07-01"
 *       - name: fin
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           example: "2024-07-31"
 *     responses:
 *       200:
 *         description: Resumen con total, cantidad y pagos por tipo
 *       400:
 *         description: Fechas requeridas
 *       500:
 *         description: Error interno
 */
router.get('/resumen-rango', async (req, res) => {
  const { inicio, fin } = req.query;

  if (!inicio || !fin) {
    return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin' });
  }

  try {
    const fechaInicio = new Date(`${inicio}T00:00:00`);
    const fechaFin = new Date(`${fin}T23:59:59.999`);

    const ventas = await Venta.find({ fecha: { $gte: fechaInicio, $lte: fechaFin } });

    const total = ventas.reduce((acc, v) => acc + v.total, 0);
    const cantidad = ventas.length;

    const porTipoPago = {};
    ventas.forEach(v => {
      porTipoPago[v.tipo_pago] = (porTipoPago[v.tipo_pago] || 0) + v.total;
    });

    res.json({ total, cantidad, porTipoPago });
  } catch (err) {
    console.error('Error al obtener resumen por rango:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @swagger
 * /ventas:
 *   post:
 *     summary: Registrar una nueva venta
 *     tags: [Ventas]
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
 *               tipo_pedido:
 *                 type: string
 *     responses:
 *       200:
 *         description: Venta registrada exitosamente
 *       500:
 *         description: Error al registrar venta
 */
router.post('/', async (req, res) => {
  try {
    const { productos, total, tipo_pago, tipo_pedido } = req.body;

    const venta = new Venta({
      productos,
      total,
      tipo_pago,
      tipo_pedido,
      fecha: new Date(),
      numero_pedido: Math.floor(Math.random() * 100)
    });

    await venta.save();
    res.json({ mensaje: 'Venta registrada', numero_pedido: venta.numero_pedido });
  } catch (err) {
    console.error('Error al registrar venta:', err);
    res.status(500).json({ error: 'Error interno al registrar venta' });
  }
});

module.exports = router;
