const express = require("express");
const multer = require("multer");
const Producto = require("../models/product.model.js");
const { subirImagen, eliminarImagen } = require("../utils/cloudinary");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // Guarda la imagen temporalmente en memoria

// ✅ CREAR PRODUCTO
router.post("/", upload.single("imagen"), async (req, res) => {
  try {
    let imagen_url = "";
    let cloudinary_id = "";

    if (req.file) {
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    }

    const stock = req.body.stock && !isNaN(parseInt(req.body.stock)) ? parseInt(req.body.stock) : null;

    const nuevo = new Producto({
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      precio: parseFloat(req.body.precio),
      stock,
      imagen_url,
      cloudinary_id,
      categoria: req.body.categoria || null,
    });

    const guardado = await nuevo.save();
    res.status(201).json(guardado);
  } catch (err) {
    console.error("❌ Error al crear producto:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ LISTAR PRODUCTOS
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find()
      .populate("categoria", "nombre")
      .sort({ creado_en: -1 });
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// ✅ OBTENER PRODUCTO POR ID
router.get("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id).populate("categoria", "nombre");
    res.json(producto);
  } catch (err) {
    res.status(404).json({ error: "Producto no encontrado" });
  }
});

// ✅ EDITAR PRODUCTO
router.put("/:id", upload.single("imagen"), async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

    let imagen_url = producto.imagen_url;
    let cloudinary_id = producto.cloudinary_id;

    if (req.file) {
      if (cloudinary_id) await eliminarImagen(cloudinary_id);
      const subida = await subirImagen(req.file);
      imagen_url = subida.secure_url;
      cloudinary_id = subida.public_id;
    }

    const stock = req.body.stock && !isNaN(parseInt(req.body.stock)) ? parseInt(req.body.stock) : null;

    const actualizar = {
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      precio: parseFloat(req.body.precio),
      stock,
      imagen_url,
      cloudinary_id,
      categoria: req.body.categoria || null,
    };

    const actualizado = await Producto.findByIdAndUpdate(req.params.id, actualizar, { new: true });
    res.json(actualizado);
  } catch (err) {
    console.error("❌ Error al editar producto:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✅ ELIMINAR PRODUCTO
router.delete("/:id", async (req, res) => {
  try {
    const producto = await Producto.findByIdAndDelete(req.params.id);
    if (producto?.cloudinary_id) {
      await eliminarImagen(producto.cloudinary_id);
    }
    res.json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
