const express = require('express');
const mongoose = require('mongoose');
const RestauranteMesa = require('../models/restauranteMesa.model');
const RestauranteComanda = require('../models/restauranteComanda.model');
const ProductoLocal = require('../models/productLocal.model');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');
const { adjuntarScopeLocal, requiereLocal } = require('../middlewares/localScope');

const router = express.Router();
router.use(adjuntarScopeLocal);
router.use(requiereLocal);

const ESTADOS_MESA = new Set(['libre', 'ocupada', 'reservada', 'inactiva']);
const ESTADOS_COMANDA = new Set([
  'abierta',
  'en_preparacion',
  'lista',
  'entregada',
  'cerrada',
  'cancelada'
]);

const esObjectIdValido = (id) => mongoose.Types.ObjectId.isValid(id);
const esAdmin = (rol) => rol === 'admin' || rol === 'superadmin';

const normalizarItemsComanda = async (itemsRaw, localId) => {
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    throw new Error('Debes agregar al menos un item');
  }

  const items = [];
  for (const item of itemsRaw) {
    const productoId = item?.productoId;
    const cantidad = Number(item?.cantidad);
    const nota = sanitizeOptionalText(item?.nota, { max: 140 }) || '';

    if (!productoId || !esObjectIdValido(productoId)) {
      throw new Error('Item con producto invalido');
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error('Item con cantidad invalida');
    }

    const producto = await ProductoLocal.findOne({ _id: productoId, local: localId })
      .populate('productoBase')
      .lean();
    if (!producto) {
      throw new Error('Producto no encontrado en este local');
    }

    const nombre = sanitizeText(producto.productoBase?.nombre, { max: 120 }) || 'Producto';
    const precioUnitario = Number(producto.precio);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw new Error(`Producto con precio invalido: ${nombre}`);
    }

    items.push({
      productoId: producto._id,
      nombre,
      precio_unitario: precioUnitario,
      cantidad,
      nota,
      subtotal: precioUnitario * cantidad
    });
  }

  return items;
};

router.get('/productos', async (req, res) => {
  try {
    const productos = await ProductoLocal.find({ local: req.localId, activo: true })
      .populate('productoBase', 'nombre')
      .sort({ createdAt: -1 })
      .lean();

    const respuesta = productos.map((producto) => ({
      _id: producto._id,
      nombre: sanitizeText(producto?.productoBase?.nombre, { max: 120 }) || 'Producto',
      precio: Number(producto?.precio) || 0
    }));

    res.json(respuesta);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos para restaurante' });
  }
});

router.get('/mesas', async (req, res) => {
  try {
    const soloActivas = String(req.query.activas || 'true') !== 'false';
    const filtro = { local: req.localId };
    if (soloActivas) filtro.activa = true;

    const mesas = await RestauranteMesa.find(filtro).sort({ numero: 1 });
    res.json(mesas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener mesas' });
  }
});

router.post('/mesas', async (req, res) => {
  try {
    const numero = Number(req.body.numero);
    if (!Number.isFinite(numero) || numero <= 0) {
      return res.status(400).json({ error: 'Numero de mesa invalido' });
    }

    const payload = {
      local: req.localId,
      numero,
      nombre: sanitizeOptionalText(req.body.nombre, { max: 80 }) || '',
      zona: sanitizeOptionalText(req.body.zona, { max: 80 }) || '',
      capacidad: Number(req.body.capacidad) || 4,
      estado: 'libre',
      activa: true
    };

    const nueva = await RestauranteMesa.create(payload);
    res.status(201).json(nueva);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una mesa con ese numero' });
    }
    res.status(500).json({ error: 'Error al crear mesa' });
  }
});

router.patch('/mesas/:id/estado', async (req, res) => {
  try {
    const estado = sanitizeText(req.body.estado, { max: 30 });
    if (!estado || !ESTADOS_MESA.has(estado)) {
      return res.status(400).json({ error: 'Estado de mesa invalido' });
    }

    const mesa = await RestauranteMesa.findOne({ _id: req.params.id, local: req.localId });
    if (!mesa) {
      return res.status(404).json({ error: 'Mesa no encontrada' });
    }

    mesa.estado = estado;
    if (estado === 'inactiva') {
      mesa.activa = false;
    }
    await mesa.save();

    res.json(mesa);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado de mesa' });
  }
});

router.put('/mesas/:id', async (req, res) => {
  try {
    if (!esAdmin(req.userRole)) {
      return res.status(403).json({ error: 'Solo admin puede editar mesas' });
    }

    const mesa = await RestauranteMesa.findOne({ _id: req.params.id, local: req.localId });
    if (!mesa) {
      return res.status(404).json({ error: 'Mesa no encontrada' });
    }

    if (req.body?.numero !== undefined) {
      const numero = Number(req.body.numero);
      if (!Number.isFinite(numero) || numero <= 0) {
        return res.status(400).json({ error: 'Numero de mesa invalido' });
      }
      mesa.numero = numero;
    }

    if (req.body?.nombre !== undefined) {
      mesa.nombre = sanitizeOptionalText(req.body.nombre, { max: 80 }) || '';
    }

    if (req.body?.zona !== undefined) {
      mesa.zona = sanitizeOptionalText(req.body.zona, { max: 80 }) || '';
    }

    if (req.body?.capacidad !== undefined) {
      const capacidad = Number(req.body.capacidad);
      if (!Number.isFinite(capacidad) || capacidad <= 0) {
        return res.status(400).json({ error: 'Capacidad invalida' });
      }
      mesa.capacidad = capacidad;
    }

    if (req.body?.estado !== undefined) {
      const estado = sanitizeText(req.body.estado, { max: 30 });
      if (!estado || !ESTADOS_MESA.has(estado)) {
        return res.status(400).json({ error: 'Estado de mesa invalido' });
      }
      mesa.estado = estado;
      mesa.activa = estado !== 'inactiva';
    }

    await mesa.save();
    res.json(mesa);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una mesa con ese numero' });
    }
    res.status(400).json({ error: error.message || 'Error al editar mesa' });
  }
});

router.delete('/mesas/:id', async (req, res) => {
  try {
    if (!esAdmin(req.userRole)) {
      return res.status(403).json({ error: 'Solo admin puede eliminar mesas' });
    }

    const mesa = await RestauranteMesa.findOne({ _id: req.params.id, local: req.localId });
    if (!mesa) {
      return res.status(404).json({ error: 'Mesa no encontrada' });
    }

    const comandaActiva = await RestauranteComanda.exists({
      local: req.localId,
      mesa: mesa._id,
      estado: { $in: ['abierta', 'en_preparacion', 'lista', 'entregada'] }
    });
    if (comandaActiva) {
      return res.status(400).json({
        error: 'No se puede eliminar la mesa porque tiene comandas activas'
      });
    }

    await mesa.deleteOne();
    res.json({ mensaje: 'Mesa eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar mesa' });
  }
});

router.get('/comandas', async (req, res) => {
  try {
    const estado = sanitizeOptionalText(req.query.estado, { max: 40 });
    const mesaId = req.query.mesaId;

    const filtro = { local: req.localId };
    if (estado && ESTADOS_COMANDA.has(estado)) {
      filtro.estado = estado;
    }
    if (mesaId && esObjectIdValido(mesaId)) {
      filtro.mesa = mesaId;
    }

    const comandas = await RestauranteComanda.find(filtro)
      .populate('mesa', 'numero nombre zona estado')
      .populate('mesero', 'nombre email rol')
      .sort({ createdAt: -1 });

    res.json(comandas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener comandas' });
  }
});

router.post('/comandas', async (req, res) => {
  try {
    const mesaId = req.body.mesaId;
    if (!mesaId || !esObjectIdValido(mesaId)) {
      return res.status(400).json({ error: 'Mesa invalida' });
    }

    const mesa = await RestauranteMesa.findOne({ _id: mesaId, local: req.localId, activa: true });
    if (!mesa) {
      return res.status(404).json({ error: 'Mesa no encontrada' });
    }
    if (mesa.estado === 'inactiva') {
      return res.status(400).json({ error: 'La mesa esta inactiva' });
    }

    const items = await normalizarItemsComanda(req.body.items, req.localId);
    const observacion = sanitizeOptionalText(req.body.observacion, { max: 200 }) || '';

    const comanda = new RestauranteComanda({
      local: req.localId,
      mesa: mesa._id,
      mesero: req.userId || null,
      estado: 'abierta',
      observacion,
      items
    });

    await comanda.save();

    if (mesa.estado === 'libre') {
      mesa.estado = 'ocupada';
      await mesa.save();
    }

    const poblada = await RestauranteComanda.findById(comanda._id)
      .populate('mesa', 'numero nombre zona estado')
      .populate('mesero', 'nombre email rol');

    res.status(201).json(poblada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al crear comanda' });
  }
});

router.post('/comandas/:id/items', async (req, res) => {
  try {
    const comanda = await RestauranteComanda.findOne({ _id: req.params.id, local: req.localId });
    if (!comanda) {
      return res.status(404).json({ error: 'Comanda no encontrada' });
    }
    if (comanda.estado === 'cerrada' || comanda.estado === 'cancelada') {
      return res.status(400).json({ error: 'No se pueden agregar items a una comanda cerrada' });
    }

    const nuevosItems = await normalizarItemsComanda(req.body.items, req.localId);
    comanda.items.push(...nuevosItems);
    await comanda.save();

    const poblada = await RestauranteComanda.findById(comanda._id)
      .populate('mesa', 'numero nombre zona estado')
      .populate('mesero', 'nombre email rol');

    res.json(poblada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al agregar items' });
  }
});

router.patch('/comandas/:id/estado', async (req, res) => {
  try {
    const estado = sanitizeText(req.body.estado, { max: 40 });
    if (!estado || !ESTADOS_COMANDA.has(estado)) {
      return res.status(400).json({ error: 'Estado de comanda invalido' });
    }

    const comanda = await RestauranteComanda.findOne({ _id: req.params.id, local: req.localId });
    if (!comanda) {
      return res.status(404).json({ error: 'Comanda no encontrada' });
    }

    comanda.estado = estado;
    if (estado === 'cerrada' || estado === 'cancelada') {
      comanda.cerradaEn = new Date();
    }
    await comanda.save();

    const mesa = await RestauranteMesa.findOne({ _id: comanda.mesa, local: req.localId });
    if (mesa) {
      if (estado === 'cerrada' || estado === 'cancelada') {
        const abierta = await RestauranteComanda.exists({
          _id: { $ne: comanda._id },
          local: req.localId,
          mesa: mesa._id,
          estado: { $in: ['abierta', 'en_preparacion', 'lista', 'entregada'] }
        });
        if (!abierta) {
          mesa.estado = 'libre';
          await mesa.save();
        }
      } else if (mesa.estado === 'libre') {
        mesa.estado = 'ocupada';
        await mesa.save();
      }
    }

    const poblada = await RestauranteComanda.findById(comanda._id)
      .populate('mesa', 'numero nombre zona estado')
      .populate('mesero', 'nombre email rol');

    res.json(poblada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado de comanda' });
  }
});

router.put('/comandas/:id', async (req, res) => {
  try {
    if (!esAdmin(req.userRole)) {
      return res.status(403).json({ error: 'Solo admin puede editar comandas' });
    }

    const comanda = await RestauranteComanda.findOne({ _id: req.params.id, local: req.localId });
    if (!comanda) {
      return res.status(404).json({ error: 'Comanda no encontrada' });
    }
    if (comanda.estado === 'cerrada' || comanda.estado === 'cancelada') {
      return res.status(400).json({ error: 'No se puede editar una comanda cerrada' });
    }

    const mesaId = req.body?.mesaId;
    if (mesaId !== undefined) {
      if (!mesaId || !esObjectIdValido(mesaId)) {
        return res.status(400).json({ error: 'Mesa invalida' });
      }
      const mesaDestino = await RestauranteMesa.findOne({
        _id: mesaId,
        local: req.localId,
        activa: true
      });
      if (!mesaDestino || mesaDestino.estado === 'inactiva') {
        return res.status(400).json({ error: 'Mesa destino invalida' });
      }

      const mesaAnteriorId = String(comanda.mesa);
      comanda.mesa = mesaDestino._id;
      if (mesaDestino.estado === 'libre') {
        mesaDestino.estado = 'ocupada';
        await mesaDestino.save();
      }

      if (mesaAnteriorId !== String(mesaDestino._id)) {
        const abiertaEnAnterior = await RestauranteComanda.exists({
          _id: { $ne: comanda._id },
          local: req.localId,
          mesa: mesaAnteriorId,
          estado: { $in: ['abierta', 'en_preparacion', 'lista', 'entregada'] }
        });
        if (!abiertaEnAnterior) {
          await RestauranteMesa.updateOne(
            { _id: mesaAnteriorId, local: req.localId },
            { $set: { estado: 'libre' } }
          );
        }
      }
    }

    if (req.body?.observacion !== undefined) {
      comanda.observacion = sanitizeOptionalText(req.body.observacion, { max: 200 }) || '';
    }

    if (req.body?.estado !== undefined) {
      const estado = sanitizeText(req.body.estado, { max: 40 });
      if (!estado || !ESTADOS_COMANDA.has(estado)) {
        return res.status(400).json({ error: 'Estado de comanda invalido' });
      }
      comanda.estado = estado;
      if (estado === 'cerrada' || estado === 'cancelada') {
        comanda.cerradaEn = new Date();
      }
    }

    if (req.body?.items !== undefined) {
      const nuevosItems = await normalizarItemsComanda(req.body.items, req.localId);
      comanda.items = nuevosItems;
    }

    await comanda.save();

    const poblada = await RestauranteComanda.findById(comanda._id)
      .populate('mesa', 'numero nombre zona estado')
      .populate('mesero', 'nombre email rol');

    res.json(poblada);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Error al editar comanda' });
  }
});

router.delete('/comandas/:id', async (req, res) => {
  try {
    if (!esAdmin(req.userRole)) {
      return res.status(403).json({ error: 'Solo admin puede eliminar comandas' });
    }

    const comanda = await RestauranteComanda.findOne({ _id: req.params.id, local: req.localId });
    if (!comanda) {
      return res.status(404).json({ error: 'Comanda no encontrada' });
    }

    const mesaId = String(comanda.mesa);
    await comanda.deleteOne();

    const abierta = await RestauranteComanda.exists({
      local: req.localId,
      mesa: mesaId,
      estado: { $in: ['abierta', 'en_preparacion', 'lista', 'entregada'] }
    });
    if (!abierta) {
      await RestauranteMesa.updateOne({ _id: mesaId, local: req.localId }, { $set: { estado: 'libre' } });
    }

    res.json({ mensaje: 'Comanda eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar comanda' });
  }
});

module.exports = router;
