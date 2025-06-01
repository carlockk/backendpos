import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Usuario from './models/usuario.model.js';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const email = 'admin@pos.com';
const password = 'admin123'; // Sin hashear
const yaExiste = await Usuario.findOne({ email });

if (yaExiste) {
  yaExiste.password = password;
  await yaExiste.save();
  console.log('🔁 Contraseña actualizada');
} else {
  await Usuario.create({ email, password, rol: 'admin' });
  console.log('✅ Usuario admin creado');
}

process.exit();
