const mongoose = require('mongoose');

const AppSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  // Discount settings
  discountRate: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  ordersRequiredForDiscount: {
    type: Number,
    default: 3,
    min: 1
  },
  autoCreateDiscount: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Static method to get settings (singleton pattern)
AppSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'default' });

  if (!settings) {
    settings = await this.create({
      key: 'default',
      discountRate: 10,
      ordersRequiredForDiscount: 3,
      autoCreateDiscount: true
    });
  }

  return settings;
};

// Static method to update settings
AppSettingsSchema.statics.updateSettings = async function(updates) {
  const settings = await this.findOneAndUpdate(
    { key: 'default' },
    updates,
    { new: true, upsert: true, runValidators: true }
  );
  return settings;
};

AppSettingsSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AppSettings', AppSettingsSchema);
