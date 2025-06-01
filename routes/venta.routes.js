import express from 'express';
import Venta from '../models/venta.model.js';

const router = express.Router();

// ✅ Obtener todas las ventas (historial)
router.get('/', async (req, res) => {
  try {
    const ventas = await Venta.find().sort({ fecha: -1 });
    res.json(ventas);
  } catch (err) {
    console.error('Error al obtener historial:', err);
    res.status(500).json({ error: 'Error interno al obtener historial' });
  }
});

// ✅ Obtener resumen por fecha para el dashboard
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

// ✅ NUEVO: Obtener resumen por rango de fechas
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

// ✅ Registrar una venta
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

export default router;
