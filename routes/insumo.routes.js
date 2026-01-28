const express = require('express');
const mongoose = require('mongoose');
const Insumo = require('../models/insumo.model');
const InsumoLote = require('../models/insumoLote.model');
const InsumoMovimiento = require('../models/insumoMovimiento.model');
const { sanitizeText, sanitizeOptionalText, toNumberOrNull } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

const parsePositiveNumber = (value, field) => {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`El campo ${field} es invalido`);
  }
  return numero;
};

router.get('/', async (req, res) => {
  try {
    const insumos = await Insumo.find({ local: req.localId }).sort({ nombre: 1 });
    res.json(insumos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener insumos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';
    const unidad = sanitizeText(req.body.unidad, { max: 20 });
    const stockMinimo = toNumberOrNull(req.body.stock_minimo);
    const alertaVenc = toNumberOrNull(req.body.alerta_vencimiento_dias);

    if (!nombre || !unidad) {
      return res.status(400).json({ error: 'Nombre y unidad son requeridos' });
    }

    const existe = await Insumo.findOne({ nombre, local: req.localId });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe un insumo con ese nombre' });
    }

    const nuevo = new Insumo({
      nombre,
      descripcion,
      unidad,
      stock_minimo: stockMinimo ?? 0,
      alerta_vencimiento_dias: alertaVenc ?? 7,
      local: req.localId
    });
    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear insumo' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';
    const unidad = sanitizeText(req.body.unidad, { max: 20 });
    const stockMinimo = toNumberOrNull(req.body.stock_minimo);
    const alertaVenc = toNumberOrNull(req.body.alerta_vencimiento_dias);

    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId });
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    if (nombre) insumo.nombre = nombre;
    if (unidad) insumo.unidad = unidad;
    insumo.descripcion = descripcion;
    if (stockMinimo !== null) insumo.stock_minimo = stockMinimo;
    if (alertaVenc !== null) insumo.alerta_vencimiento_dias = alertaVenc;
    insumo.actualizado_en = new Date();

    const actualizado = await insumo.save();
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar insumo' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId });
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    const tieneLotes = await InsumoLote.exists({ insumo: req.params.id, local: req.localId });
    if (tieneLotes) {
      return res.status(400).json({ error: 'No se puede eliminar un insumo con lotes' });
    }

    await Insumo.deleteOne({ _id: req.params.id });
    res.json({ mensaje: 'Insumo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar insumo' });
  }
});

router.get('/:id/lotes', async (req, res) => {
  try {
    const lotes = await InsumoLote.find({ insumo: req.params.id, local: req.localId })
      .sort({ fecha_ingreso: 1 });
    res.json(lotes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lotes' });
  }
});

router.get('/:id/movimientos', async (req, res) => {
  try {
    const movimientos = await InsumoMovimiento.find({
      insumo: req.params.id,
      local: req.localId
    }).sort({ fecha: -1 });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

router.post('/:id/movimientos', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const tipo = sanitizeText(req.body.tipo, { max: 10 });
    const cantidad = parsePositiveNumber(req.body.cantidad, 'cantidad');
    const motivo = sanitizeOptionalText(req.body.motivo, { max: 200 }) || '';
    const loteId = req.body.loteId;
    const loteNombre = sanitizeOptionalText(req.body.lote, { max: 80 }) || '';
    const fechaVenc = req.body.fecha_vencimiento ? new Date(req.body.fecha_vencimiento) : null;

    if (!tipo || !['entrada', 'salida'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de movimiento invalido' });
    }

    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId }).session(session);
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo no encontrado' });
    }

    let lote = null;
    if (tipo === 'entrada') {
      if (loteId) {
        if (!mongoose.Types.ObjectId.isValid(loteId)) {
          return res.status(400).json({ error: 'Lote invalido' });
        }
        lote = await InsumoLote.findOne({ _id: loteId, local: req.localId }).session(session);
        if (!lote) {
          return res.status(404).json({ error: 'Lote no encontrado' });
        }
        lote.cantidad += cantidad;
        await lote.save({ session });
      } else {
        lote = new InsumoLote({
          insumo: insumo._id,
          local: req.localId,
          lote: loteNombre || undefined,
          fecha_vencimiento: fechaVenc || null,
          cantidad,
          fecha_ingreso: new Date()
        });
        await lote.save({ session });
      }
      insumo.stock_total += cantidad;
    } else {
      if (loteId) {
        if (!mongoose.Types.ObjectId.isValid(loteId)) {
          return res.status(400).json({ error: 'Lote invalido' });
        }
        lote = await InsumoLote.findOne({ _id: loteId, local: req.localId }).session(session);
        if (!lote) {
          return res.status(404).json({ error: 'Lote no encontrado' });
        }
      } else {
        lote = await InsumoLote.findOne({ insumo: insumo._id, local: req.localId, cantidad: { $gt: 0 } })
          .sort({ fecha_ingreso: 1 })
          .session(session);
      }
      if (!lote) {
        return res.status(400).json({ error: 'No hay lote disponible para salida' });
      }
      if (lote.cantidad < cantidad) {
        return res.status(400).json({ error: 'Cantidad supera el stock del lote' });
      }
      lote.cantidad -= cantidad;
      await lote.save({ session });
      insumo.stock_total = Math.max(0, insumo.stock_total - cantidad);
    }

    await insumo.save({ session });

    const movimiento = new InsumoMovimiento({
      insumo: insumo._id,
      local: req.localId,
      lote: lote?._id || null,
      tipo,
      cantidad,
      motivo,
      usuario: req.userId || null
    });
    await movimiento.save({ session });

    await session.commitTransaction();
    res.status(201).json({ mensaje: 'Movimiento registrado', lote });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    res.status(400).json({ error: error.message || 'Error al registrar movimiento' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
