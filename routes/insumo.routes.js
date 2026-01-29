const express = require('express');
const mongoose = require('mongoose');
const Insumo = require('../models/insumo.model');
const InsumoLote = require('../models/insumoLote.model');
const InsumoMovimiento = require('../models/insumoMovimiento.model');
const InsumoAlertaConfig = require('../models/insumoAlertaConfig.model');
const Usuario = require('../models/usuario.model.js');
const Local = require('../models/local.model');
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
    const incluirOcultos = String(req.query?.incluir_ocultos) === 'true';
    const filtro = { local: req.localId };
    if (!incluirOcultos) {
      filtro.$or = [{ activo: true }, { activo: { $exists: false } }];
    }
    const insumos = await Insumo.find(filtro)
      .populate('categoria', 'nombre')
      .sort({ orden: 1, nombre: 1 });
    res.json(insumos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener insumos' });
  }
});

router.put('/orden', async (req, res) => {
  try {
    if (!['admin', 'superadmin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const orden = Array.isArray(req.body?.orden) ? req.body.orden : [];
    const ids = Array.from(new Set(orden.filter((id) => mongoose.Types.ObjectId.isValid(id))));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Orden invalido' });
    }
    await Promise.all(
      ids.map((id, index) =>
        Insumo.updateOne({ _id: id, local: req.localId }, { orden: index + 1 })
      )
    );
    res.json({ mensaje: 'Orden actualizado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar orden' });
  }
});

router.put('/:id/estado', async (req, res) => {
  try {
    const activo = req.body?.activo;
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    const insumo = await Insumo.findOneAndUpdate(
      { _id: req.params.id, local: req.localId },
      { activo, actualizado_en: new Date() },
      { new: true }
    );
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });
    res.json(insumo);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar insumo' });
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
    const insumos = await Insumo.find({
      local: req.localId,
      $or: [{ activo: true }, { activo: { $exists: false } }]
    });
    const insumosBajos = insumos.filter(
      (insumo) => Number(insumo.stock_total || 0) <= Number(insumo.stock_minimo || 0)
    );
    const lotes = await InsumoLote.find({
      local: req.localId,
      activo: true,
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

router.post('/clonar', async (req, res) => {
  try {
    if (req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const sourceLocalId = req.body.sourceLocalId || req.localId;
    const targetLocalId = req.body.targetLocalId;
    const insumoId = req.body.insumoId;
    const clonarTodos = Boolean(req.body.clonarTodos);

    if (!mongoose.Types.ObjectId.isValid(sourceLocalId || '')) {
      return res.status(400).json({ error: 'Local origen invalido' });
    }
    if (!mongoose.Types.ObjectId.isValid(targetLocalId || '')) {
      return res.status(400).json({ error: 'Local destino invalido' });
    }
    if (String(sourceLocalId) === String(targetLocalId)) {
      return res.status(400).json({ error: 'El local destino debe ser distinto' });
    }

    const [sourceLocal, targetLocal] = await Promise.all([
      Local.findById(sourceLocalId),
      Local.findById(targetLocalId)
    ]);
    if (!sourceLocal || !targetLocal) {
      return res.status(400).json({ error: 'Local no encontrado' });
    }

    let origen = [];
    if (clonarTodos) {
      origen = await Insumo.find({
        local: sourceLocalId,
        $or: [{ activo: true }, { activo: { $exists: false } }]
      }).lean();
      if (!origen.length) {
        return res.status(400).json({ error: 'No hay insumos para clonar' });
      }
    } else {
      if (!mongoose.Types.ObjectId.isValid(insumoId || '')) {
        return res.status(400).json({ error: 'Insumo invalido' });
      }
      const insumo = await Insumo.findOne({ _id: insumoId, local: sourceLocalId }).lean();
      if (!insumo) {
        return res.status(404).json({ error: 'Insumo no encontrado' });
      }
      origen = [insumo];
    }

    let creados = 0;
    let omitidos = 0;
    const nuevos = [];

    for (const insumo of origen) {
      const existe = await Insumo.findOne({
        local: targetLocalId,
        nombre: insumo.nombre
      }).lean();
      if (existe) {
        omitidos += 1;
        continue;
      }
      nuevos.push({
        nombre: insumo.nombre,
        descripcion: insumo.descripcion || '',
        unidad: insumo.unidad,
        stock_total: 0,
        stock_minimo: insumo.stock_minimo || 0,
        alerta_vencimiento_dias: insumo.alerta_vencimiento_dias || 7,
        local: targetLocalId,
        activo: true,
        creado_en: new Date(),
        actualizado_en: new Date()
      });
    }

    if (nuevos.length) {
      await Insumo.insertMany(nuevos);
      creados = nuevos.length;
    }

    res.json({
      mensaje: `Clonado completado. Creados: ${creados}, Omitidos: ${omitidos}`,
      creados,
      omitidos
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al clonar insumos' });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = sanitizeText(req.body.nombre, { max: 120 });
    const descripcion = sanitizeOptionalText(req.body.descripcion, { max: 300 }) || '';
    const unidad = sanitizeText(req.body.unidad, { max: 20 });
    const categoriaRaw = req.body.categoria;
    const stockMinimo = toNumberOrNull(req.body.stock_minimo);
    const alertaVenc = toNumberOrNull(req.body.alerta_vencimiento_dias);

    if (!nombre || !unidad) {
      return res.status(400).json({ error: 'Nombre y unidad son requeridos' });
    }

    const existe = await Insumo.findOne({ nombre, local: req.localId });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe un insumo con ese nombre' });
    }

    let categoriaId = null;
    if (categoriaRaw) {
      if (!mongoose.Types.ObjectId.isValid(categoriaRaw)) {
        return res.status(400).json({ error: 'Categoria invalida' });
      }
      categoriaId = categoriaRaw;
    }

    const nuevo = new Insumo({
      nombre,
      descripcion,
      unidad,
      stock_minimo: stockMinimo ?? 0,
      alerta_vencimiento_dias: alertaVenc ?? 7,
      categoria: categoriaId,
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
    const categoriaRaw = req.body.categoria;
    const stockMinimo = toNumberOrNull(req.body.stock_minimo);
    const alertaVenc = toNumberOrNull(req.body.alerta_vencimiento_dias);

    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId });
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    if (nombre) insumo.nombre = nombre;
    if (unidad) insumo.unidad = unidad;
    insumo.descripcion = descripcion;
    if (stockMinimo !== null) insumo.stock_minimo = stockMinimo;
    if (alertaVenc !== null) insumo.alerta_vencimiento_dias = alertaVenc;
    if (categoriaRaw !== undefined) {
      if (categoriaRaw === null || String(categoriaRaw).trim() === '') {
        insumo.categoria = null;
      } else if (!mongoose.Types.ObjectId.isValid(categoriaRaw)) {
        return res.status(400).json({ error: 'Categoria invalida' });
      } else {
        insumo.categoria = categoriaRaw;
      }
    }
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
    const incluirOcultos = String(req.query?.incluir_ocultos) === 'true';
    const incluirSinInfo = String(req.query?.incluir_sin_info) === 'true';
    const filtro = { insumo: req.params.id, local: req.localId };
    if (!incluirOcultos) {
      filtro.$or = [{ activo: true }, { activo: { $exists: false } }];
    }
    if (!incluirSinInfo) {
      filtro.$and = [
        {
          $or: [
            { lote: { $exists: true, $ne: '' } },
            { fecha_vencimiento: { $ne: null } }
          ]
        }
      ];
    }
    const lotes = await InsumoLote.find(filtro).sort({ fecha_ingreso: 1 });
    res.json(lotes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener lotes' });
  }
});

router.put('/:id/lotes/:loteId/estado', async (req, res) => {
  try {
    const activo = req.body?.activo;
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.loteId)) {
      return res.status(400).json({ error: 'Lote invalido' });
    }
    const lote = await InsumoLote.findOneAndUpdate(
      {
        _id: req.params.loteId,
        insumo: req.params.id,
        local: req.localId
      },
      { activo },
      { new: true }
    );
    if (!lote) {
      return res.status(404).json({ error: 'Lote no encontrado' });
    }
    res.json(lote);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar lote' });
  }
});

router.delete('/:id/lotes', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId }).session(session);
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    const lotes = await InsumoLote.find({ insumo: req.params.id, local: req.localId }).session(session);
    const totalLotes = lotes.reduce((acc, lote) => acc + (lote.cantidad || 0), 0);

    await InsumoLote.deleteMany({ insumo: req.params.id, local: req.localId }).session(session);

    insumo.stock_total = Math.max(0, Number(insumo.stock_total || 0) - totalLotes);
    await insumo.save({ session });

    await InsumoMovimiento.deleteMany({ insumo: req.params.id, local: req.localId }).session(session);

    await session.commitTransaction();
    res.json({ mensaje: 'Lotes eliminados' });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    res.status(500).json({ error: 'Error al eliminar lotes' });
  } finally {
    session.endSession();
  }
});

router.delete('/:id/lotes/:loteId', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const insumo = await Insumo.findOne({ _id: req.params.id, local: req.localId }).session(session);
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    if (!mongoose.Types.ObjectId.isValid(req.params.loteId)) {
      return res.status(400).json({ error: 'Lote invalido' });
    }

    const lote = await InsumoLote.findOne({
      _id: req.params.loteId,
      insumo: req.params.id,
      local: req.localId
    }).session(session);
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    await InsumoLote.deleteOne({ _id: lote._id }).session(session);
    insumo.stock_total = Math.max(0, Number(insumo.stock_total || 0) - Number(lote.cantidad || 0));
    await insumo.save({ session });

    await InsumoMovimiento.deleteMany({ lote: lote._id, local: req.localId }).session(session);

    await session.commitTransaction();
    res.json({ mensaje: 'Lote eliminado' });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    res.status(500).json({ error: 'Error al eliminar lote' });
  } finally {
    session.endSession();
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
    if (insumo.activo === false) {
      return res.status(400).json({ error: 'El insumo esta oculto' });
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
        if (lote.activo === false) {
          return res.status(400).json({ error: 'El lote esta oculto' });
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
        if (lote.activo === false) {
          return res.status(400).json({ error: 'El lote esta oculto' });
        }
        if (lote.cantidad < cantidad) {
          return res.status(400).json({ error: 'Cantidad supera el stock del lote' });
        }
        lote.cantidad -= cantidad;
        await lote.save({ session });
      } else {
        const lotesDisponibles = await InsumoLote.find({
          insumo: insumo._id,
          local: req.localId,
          $or: [{ activo: true }, { activo: { $exists: false } }],
          cantidad: { $gt: 0 }
        })
          .sort({ fecha_ingreso: 1 })
          .session(session);

        if (!lotesDisponibles.length) {
          return res.status(400).json({ error: 'No hay lote disponible para salida' });
        }

        const totalDisponible = lotesDisponibles.reduce((acc, item) => acc + (item.cantidad || 0), 0);
        if (totalDisponible < cantidad) {
          return res.status(400).json({ error: 'Cantidad supera el stock disponible' });
        }

        let restante = cantidad;
        for (const item of lotesDisponibles) {
          if (restante <= 0) break;
          const consumir = Math.min(item.cantidad, restante);
          item.cantidad -= consumir;
          restante -= consumir;
          await item.save({ session });
          if (!lote) {
            lote = item;
          }
        }
      }

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
        if (refreshed.activo === false) return;

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
          $or: [{ activo: true }, { activo: { $exists: false } }],
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
