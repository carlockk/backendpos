const express = require('express');
const Caja = require('../models/caja.model.js');
const Venta = require('../models/venta.model.js');

const router = express.Router();

// Abrir caja
router.post('/abrir', async (req, res) => {
  try {
    const monto = parseFloat(req.body.monto_inicial);
    if (isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Monto inicial inválido' });
    }

    const caja_abierta = await Caja.findOne({ cierre: null });
    if (caja_abierta) {
      return res.status(400).json({ error: 'Ya hay una caja abierta.' });
    }

    const nueva = new Caja({ monto_inicial: monto });
    await nueva.save();

    res.json({ mensaje: 'Caja abierta', id: nueva._id });
  } catch (error) {
    console.error('Error al abrir caja:', error);
    res.status(500).json({ error: 'Error del servidor al abrir la caja' });
  }
});

// Cerrar caja
router.post('/cerrar', async (req, res) => {
  try {
    const caja = await Caja.findOne({ cierre: null });
    if (!caja) return res.status(400).json({ error: 'No hay caja abierta.' });

    const ventas = await Venta.find({ fecha: { $gte: caja.apertura } });
    const total_vendido = ventas.reduce((sum, v) => sum + v.total, 0);

    const desglose = {};
    ventas.forEach(v => {
      const metodo = v.tipo_pago || 'Otro';
      desglose[metodo] = (desglose[metodo] || 0) + v.total;
    });

    caja.cierre = new Date();
    caja.monto_total_vendido = total_vendido;
    caja.monto_total_final = caja.monto_inicial + total_vendido;
    caja.desglose_por_pago = desglose;

    caja.usuario = req.body?.nombre || 'No identificado';
    await caja.save();

    res.json({
      mensaje: 'Caja cerrada',
      resumen: {
        apertura: caja.apertura,
        cierre: caja.cierre,
        monto_inicial: caja.monto_inicial,
        vendido: total_vendido,
        total: caja.monto_total_final,
        usuario: caja.usuario,
        desglose_por_pago: desglose
      }
    });
  } catch (error) {
    console.error("❌ Error al cerrar caja:", error);
    res.status(500).json({ error: 'Error del servidor al cerrar la caja' });
  }
});

// Historial
router.get('/historial', async (_req, res) => {
  try {
    const cajas = await Caja.find().sort({ apertura: -1 });
    res.json(cajas);
  } catch (error) {
    console.error('Error en historial:', error);
    res.status(500).json({ error: 'No se pudo cargar el historial de cajas' });
  }
});

module.exports = router;
