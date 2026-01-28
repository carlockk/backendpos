const express = require('express');
const mongoose = require('mongoose');
const Insumo = require('../models/insumo.model');
const InsumoLote = require('../models/insumoLote.model');
const InsumoMovimiento = require('../models/insumoMovimiento.model');
const InsumoAlertaConfig = require('../models/insumoAlertaConfig.model');
const Usuario = require('../models/usuario.model.js');
const { sanitizeText, sanitizeOptionalText, toNumberOrNull } = require('../utils/input');
const { sendMail } = require('../utils/mailer');
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

const sameDay = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const obtenerDestinatarios = async (localId) => {
  const config = await InsumoAlertaConfig.findOne({ local: localId });
  if (!config || !Array.isArray(config.usuarios) || config.usuarios.length === 0) {
    return [];
  }
  const usuarios = await Usuario.find({ _id: { $in: config.usuarios } }, 'email nombre');
  return usuarios
    .map((u) => ({ email: u.email, nombre: u.nombre }))
    .filter((u) => Boolean(u.email));
};

const evaluarVencimientos = (lotes, alertaDias) => {
  const hoy = new Date();
  const porVencer = [];
  const vencidos = [];
  lotes.forEach((lote) => {
    if (!lote.fecha_vencimiento) return;
    const venc = new Date(lote.fecha_vencimiento);
    if (Number.isNaN(venc.getTime())) return;
    const diff = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
    if (diff < 0) {
      vencidos.push(lote);
    } else if (diff <= alertaDias) {
      porVencer.push(lote);
    }
  });
  return { porVencer, vencidos };
};

router.get('/', async (req, res) => {
  try {
    const insumos = await Insumo.find({ local: req.localId }).sort({ nombre: 1 });
    res.json(insumos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener insumos' });
  }
});

router.get('/alertas/config', async (req, res) => {
  try {
    const config = await InsumoAlertaConfig.findOne({ local: req.localId });
    res.json({ usuarios: config?.usuarios || [] });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuracion de alertas' });
  }
});

router.put('/alertas/config', async (req, res) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const usuariosRaw = Array.isArray(req.body.usuarios) ? req.body.usuarios : [];
    const ids = usuariosRaw.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const usuarios = await Usuario.find(
      {
        _id: { $in: ids },
        $or: [{ local: req.localId }, { rol: 'superadmin' }]
      },
      '_id'
    );
    const usuariosValidos = usuarios.map((u) => u._id);
    const config = await InsumoAlertaConfig.findOneAndUpdate(
      { local: req.localId },
      { usuarios: usuariosValidos, actualizado_en: new Date() },
      { upsert: true, new: true }
    );
    res.json({ usuarios: config.usuarios });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuracion de alertas' });
  }
});

router.post('/alertas/resumen', async (req, res) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const destinatarios = await obtenerDestinatarios(req.localId);
    if (destinatarios.length === 0) {
      return res.status(400).json({ error: 'No hay destinatarios configurados' });
    }
    const insumos = await Insumo.find({ local: req.localId });
    const insumosBajos = insumos.filter(
      (insumo) => Number(insumo.stock_total || 0) <= Number(insumo.stock_minimo || 0)
    );
    const lotes = await InsumoLote.find({
      local: req.localId,
      cantidad: { $gt: 0 },
      fecha_vencimiento: { $ne: null }
    });

    const lotesPorInsumo = new Map();
    lotes.forEach((lote) => {
      const key = String(lote.insumo);
      if (!lotesPorInsumo.has(key)) {
        lotesPorInsumo.set(key, []);
      }
      lotesPorInsumo.get(key).push(lote);
    });

    const vencimientos = [];
    insumos.forEach((insumo) => {
      const { porVencer, vencidos } = evaluarVencimientos(
        lotesPorInsumo.get(String(insumo._id)) || [],
        Number(insumo.alerta_vencimiento_dias || 7)
      );
      if (porVencer.length || vencidos.length) {
        vencimientos.push({ insumo, porVencer, vencidos });
      }
    });

    if (insumosBajos.length === 0 && vencimientos.length === 0) {
      return res.json({ mensaje: 'No hay alertas para enviar' });
    }

    const subject = 'Resumen diario de insumos';
    const html = `
      <h3>Resumen diario de insumos</h3>
      ${insumosBajos.length ? `<h4>Stock bajo</h4><ul>${insumosBajos
        .map((insumo) => `<li>${insumo.nombre}: ${insumo.stock_total} (min ${insumo.stock_minimo})</li>`)
        .join('')}</ul>` : '<p>Sin insumos con stock bajo.</p>'}
      ${vencimientos.length ? `<h4>Vencimientos</h4><ul>${vencimientos
        .map((item) => {
          const partes = [];
          if (item.vencidos.length) partes.push(`Vencidos: ${item.vencidos.length}`);
          if (item.porVencer.length) partes.push(`Por vencer: ${item.porVencer.length}`);
          return `<li>${item.insumo.nombre}: ${partes.join(' - ')}</li>`;
        })
        .join('')}</ul>` : '<p>Sin lotes por vencer.</p>'}
    `;

    await sendMail({
      to: destinatarios.map((d) => d.email).join(','),
      subject,
      html,
      text: 'Resumen diario de insumos'
    });

    res.json({ mensaje: 'Resumen enviado' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al enviar resumen' });
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

router.get('/movimientos', async (req, res) => {
  try {
    const filtro = { local: req.localId };
    if (req.query?.insumo) {
      if (!mongoose.Types.ObjectId.isValid(req.query.insumo)) {
        return res.status(400).json({ error: 'Insumo invalido' });
      }
      filtro.insumo = req.query.insumo;
    }
    const movimientos = await InsumoMovimiento.find(filtro)
      .populate('insumo', 'nombre')
      .sort({ fecha: -1 });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos' });
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

    setImmediate(async () => {
      try {
        const destinatarios = await obtenerDestinatarios(req.localId);
        if (destinatarios.length === 0) return;

        const refreshed = await Insumo.findById(insumo._id);
        if (!refreshed) return;

        const alertaStock = Number(refreshed.stock_total || 0) <= Number(refreshed.stock_minimo || 0);
        const hoy = new Date();

        let debeAlertarStock = false;
        if (alertaStock) {
          const ultima = refreshed.last_alerta_stock_en ? new Date(refreshed.last_alerta_stock_en) : null;
          if (!sameDay(ultima, hoy)) {
            debeAlertarStock = true;
          }
        }

        const lotes = await InsumoLote.find({
          insumo: refreshed._id,
          local: req.localId,
          cantidad: { $gt: 0 },
          fecha_vencimiento: { $ne: null }
        });
        const { porVencer, vencidos } = evaluarVencimientos(
          lotes,
          Number(refreshed.alerta_vencimiento_dias || 7)
        );
        const tieneVencimientos = porVencer.length > 0 || vencidos.length > 0;

        let debeAlertarVenc = false;
        let estadoVenc = null;
        if (tieneVencimientos) {
          estadoVenc = vencidos.length ? 'vencido' : 'por_vencer';
          const ultimaFecha = refreshed.last_alerta_vencimiento_en
            ? new Date(refreshed.last_alerta_vencimiento_en)
            : null;
          if (!sameDay(ultimaFecha, hoy) || refreshed.last_alerta_vencimiento_estado !== estadoVenc) {
            debeAlertarVenc = true;
          }
        }

        if (!debeAlertarStock && !debeAlertarVenc) return;

        const subject = `Alerta de insumos - ${refreshed.nombre}`;
        const html = `
          <h3>Alerta de insumo</h3>
          <p><strong>${refreshed.nombre}</strong></p>
          ${debeAlertarStock ? `<p>Stock bajo: ${refreshed.stock_total} (min ${refreshed.stock_minimo})</p>` : ''}
          ${debeAlertarVenc ? `<p>Vencimientos: ${vencidos.length} vencidos, ${porVencer.length} por vencer</p>` : ''}
        `;

        await sendMail({
          to: destinatarios.map((d) => d.email).join(','),
          subject,
          html,
          text: subject
        });

        const update = {};
        if (debeAlertarStock) update.last_alerta_stock_en = hoy;
        if (debeAlertarVenc) {
          update.last_alerta_vencimiento_en = hoy;
          update.last_alerta_vencimiento_estado = estadoVenc;
        }
        if (Object.keys(update).length) {
          await Insumo.updateOne({ _id: refreshed._id }, update);
        }
      } catch (err) {
        // ignore email errors to avoid breaking request
      }
    });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    res.status(400).json({ error: error.message || 'Error al registrar movimiento' });
  } finally {
    session.endSession();
  }
});

module.exports = router;
