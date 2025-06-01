import express from 'express';
import Usuario from '../models/usuario.model.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos' });
  }

  try {
    const existe = await Usuario.findOne({ email });
    if (existe) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    const nuevo = new Usuario({ nombre, email, password, rol });
    await nuevo.save();

    res.status(201).json({ mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.get('/', async (req, res) => {
  try {
    const usuarios = await Usuario.find({}, '-password');
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

router.put('/:id', async (req, res) => {
  const { nombre, password, rol } = req.body;

  try {
    const actualizacion = {};
    if (nombre) actualizacion.nombre = nombre;
    if (password) actualizacion.password = password;
    if (rol) actualizacion.rol = rol;

    await Usuario.findByIdAndUpdate(req.params.id, actualizacion);
    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

export default router;
