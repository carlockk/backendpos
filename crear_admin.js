import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Usuario from './models/usuario.model.js';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const email = 'nicolas3@3.cl';
const password = '123456'; // Sin hashear
const nombre = 'Nicolas Admin'; // ✅ Nuevo campo requerido
const yaExiste = await Usuario.findOne({ email });

if (yaExiste) {
  yaExiste.password = password;
  yaExiste.nombre = nombre; // ✅ Actualiza también el nombre
  await yaExiste.save();
  console.log('🔁 Contraseña y nombre actualizados');
} else {
  await Usuario.create({ email, password, nombre, rol: 'admin' });
  console.log('✅ Usuario admin creado');
}

process.exit();
