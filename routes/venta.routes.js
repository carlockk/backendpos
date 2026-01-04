const express = require('express');
const mongoose = require('mongoose');
const Venta = require('../models/venta.model.js');
const Producto = require('../models/product.model.js');
const Caja = require('../models/caja.model.js');
const { sanitizeText, sanitizeOptionalText } = require('../utils/input');

const router = express.Router();

const obtenerAtributosVariante = (variante) => {
  if (!variante) return [];
  const atributos = [];
  if (variante.color) atributos.push({ nombre: 'Color', valor: variante.color });
  if (variante.talla) atributos.push({ nombre: 'Talla', valor: variante.talla });
  if (variante.sku) atributos.push({ nombre: 'SKU', valor: variante.sku });
  return atributos;
};

const calcularStockDesdeVariantes = (variantes = []) =>
  variantes.reduce((acc, variante) => acc + (variante.stock || 0), 0);

const armarDesglosePorTipoProducto = async (ventas = []) => {
  const ids = new Set();
  ventas.forEach((venta) => {
    venta.productos?.forEach((item) => {
      if (item?.productoId) {
        ids.add(item.productoId.toString());
      }
    });
  });

  if (ids.size === 0) {
    return {};
  }

  const productos = await Producto.find({ _id: { $in: [...ids] } }).populate('categoria', 'nombre');
  const categoriaPorProducto = new Map(
    productos.map((producto) => [
      producto._id.toString(),
      producto.categoria?.nombre || 'Sin categoria'
    ])
  );

  const porTipoProducto = {};
  ventas.forEach((venta) => {
    venta.productos?.forEach((item) => {
      const productoId = item?.productoId ? item.productoId.toString() : null;
      const categoria = productoId && categoriaPorProducto.get(productoId)
        ? categoriaPorProducto.get(productoId)
        : 'Sin categoria';
      const precio = Number(item?.precio_unitario) || 0;
      const cantidad = Number(item?.cantidad) || 0;
      const subtotal = precio * cantidad;

      if (subtotal <= 0) return;
      porTipoProducto[categoria] = (porTipoProducto[categoria] || 0) + subtotal;
    });
  });

  return porTipoProducto;
};

const armarResumenPorProducto = (ventas = []) => {
  const porProducto = new Map();

  ventas.forEach((venta) => {
    venta.productos?.forEach((item) => {
      const nombre = item?.nombre || 'Producto sin nombre';
      const cantidad = Number(item?.cantidad) || 0;
      const precio = Number(item?.precio_unitario) || 0;
      if (cantidad <= 0 || precio < 0) return;

      const actual = porProducto.get(nombre) || { nombre, cantidad: 0, total: 0 };
      actual.cantidad += cantidad;
      actual.total += cantidad * precio;
      porProducto.set(nombre, actual);
    });
  });

  return [...porProducto.values()].sort((a, b) => b.total - a.total);
};

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
 *                 porTipoProducto:
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
      const tipoPago = v.tipo_pago || 'Otro';
      porTipoPago[tipoPago] = (porTipoPago[tipoPago] || 0) + v.total;
    });

    const porTipoProducto = await armarDesglosePorTipoProducto(ventas);

    const porProducto = armarResumenPorProducto(ventas);

    res.json({ total, cantidad, porTipoPago, porTipoProducto, porProducto });
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
      const tipoPago = v.tipo_pago || 'Otro';
      porTipoPago[tipoPago] = (porTipoPago[tipoPago] || 0) + v.total;
    });

    const porTipoProducto = await armarDesglosePorTipoProducto(ventas);

    const porProducto = armarResumenPorProducto(ventas);

    res.json({ total, cantidad, porTipoPago, porTipoProducto, porProducto });
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
    const tipoPago = sanitizeText(tipo_pago, { max: 30 });
    const tipoPedido = sanitizeOptionalText(tipo_pedido, { max: 40 }) || '';

    if (!tipoPago) {
      const error = new Error('El tipo de pago es requerido.');
      error.status = 400;
      throw error;
    }

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

      const usaVariantes = Array.isArray(producto.variantes) && producto.variantes.length > 0;
      let varianteSeleccionada = null;

      if (item.varianteId) {
        varianteSeleccionada = producto.variantes.id(item.varianteId);
        if (!varianteSeleccionada) {
          const error = new Error('La variante seleccionada no existe.');
          error.status = 404;
          throw error;
        }
      }

      if (usaVariantes) {
        if (!varianteSeleccionada) {
          const error = new Error(`Debes seleccionar una variante para ${producto.nombre}.`);
          error.status = 400;
          throw error;
        }

        if (varianteSeleccionada.stock < cantidadSolicitada) {
          const error = new Error(
            `Stock insuficiente para ${producto.nombre} (${varianteSeleccionada.nombre}). Disponible: ${varianteSeleccionada.stock}`
          );
          error.status = 400;
          throw error;
        }

        varianteSeleccionada.stock -= cantidadSolicitada;
        producto.stock = calcularStockDesdeVariantes(producto.variantes);
      } else {
        const controlaStock = typeof producto.stock === 'number' && !Number.isNaN(producto.stock);
        if (controlaStock) {
          if (producto.stock < cantidadSolicitada) {
            const error = new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`);
            error.status = 400;
            throw error;
          }

          producto.stock -= cantidadSolicitada;
        }
      }

      await producto.save({ session });

      const precioUnitario =
        Number(
          item.precio_unitario ??
            (varianteSeleccionada && varianteSeleccionada.precio !== undefined
              ? varianteSeleccionada.precio
              : producto.precio)
        ) || 0;

      productosRegistrados.push({
        productoId: producto._id,
        nombre: producto.nombre,
        precio_unitario: precioUnitario,
        cantidad: cantidadSolicitada,
        observacion: sanitizeOptionalText(item.observacion, { max: 120 }) || '',
        varianteId: varianteSeleccionada?._id || null,
        varianteNombre: item.varianteNombre || varianteSeleccionada?.nombre || null,
        atributos: obtenerAtributosVariante(varianteSeleccionada)
      });
    }

    const venta = new Venta({
      productos: productosRegistrados,
      total: totalNumerico,
      tipo_pago: tipoPago,
      tipo_pedido: tipoPedido,
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
