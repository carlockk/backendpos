const express = require('express');
const mongoose = require('mongoose');
const Venta = require('../models/venta.model.js');
const Producto = require('../models/product.model.js');
const Caja = require('../models/caja.model.js');

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
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { productos, total, tipo_pago, tipo_pedido } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      const error = new Error('La venta debe incluir al menos un producto.');
      error.status = 400;
      throw error;
    }

    const totalNumerico = Number(total);
    if (Number.isNaN(totalNumerico) || totalNumerico < 0) {
      const error = new Error('El total de la venta es inválido.');
      error.status = 400;
      throw error;
    }

    const cajaAbierta = await Caja.findOne({ cierre: null }).session(session);
    if (!cajaAbierta) {
      const error = new Error('Debes abrir la caja antes de registrar ventas.');
      error.status = 400;
      throw error;
    }

    const productosRegistrados = [];

    for (const item of productos) {
      if (!item?.productoId) {
        const error = new Error('Cada producto debe incluir su identificador.');
        error.status = 400;
        throw error;
      }

      const cantidadSolicitada = Number(item.cantidad);
      if (!Number.isFinite(cantidadSolicitada) || cantidadSolicitada <= 0) {
        const error = new Error('La cantidad solicitada debe ser mayor que 0.');
        error.status = 400;
        throw error;
      }

      const producto = await Producto.findById(item.productoId).session(session);
      if (!producto) {
        const error = new Error('Producto no encontrado.');
        error.status = 404;
        throw error;
      }

      const controlaStock = typeof producto.stock === 'number' && !Number.isNaN(producto.stock);
      if (controlaStock) {
        if (producto.stock < cantidadSolicitada) {
          const error = new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`);
          error.status = 400;
          throw error;
        }

        producto.stock -= cantidadSolicitada;
        await producto.save({ session });
      }

      productosRegistrados.push({
        productoId: producto._id,
        nombre: producto.nombre,
        precio_unitario: Number(item.precio_unitario ?? producto.precio) || 0,
        cantidad: cantidadSolicitada,
        observacion: item.observacion || ''
      });
    }

    const venta = new Venta({
      productos: productosRegistrados,
      total: totalNumerico,
      tipo_pago,
      tipo_pedido,
      fecha: new Date(),
      numero_pedido: Math.floor(Math.random() * 100)
    });

    await venta.save({ session });
    await session.commitTransaction();

    res.json({ mensaje: 'Venta registrada', numero_pedido: venta.numero_pedido });
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    console.error('Error al registrar venta:', err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno al registrar venta' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
