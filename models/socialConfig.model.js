const mongoose = require('mongoose');

const socialEntrySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    url: { type: String, default: '' }
  },
  { _id: false }
);

const socialConfigSchema = new mongoose.Schema(
  {
    local: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true, unique: true },
    facebook: { type: socialEntrySchema, default: () => ({}) },
    instagram: { type: socialEntrySchema, default: () => ({}) },
    tiktok: { type: socialEntrySchema, default: () => ({}) },
    youtube: { type: socialEntrySchema, default: () => ({}) },
    x: { type: socialEntrySchema, default: () => ({}) },
    whatsapp: { type: socialEntrySchema, default: () => ({}) },
    actualizado_en: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialConfig', socialConfigSchema);
