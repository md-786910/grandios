const mongoose = require('mongoose');

const NotesHistorySchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true  // Index for efficient queries by customer
  },
  notes: {
    type: String,
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changedByName: {
    type: String,
    required: true  // Denormalized for performance
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Compound index for efficient querying by customer and time
NotesHistorySchema.index({ customerId: 1, createdAt: -1 });

// Configure JSON output
NotesHistorySchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('NotesHistory', NotesHistorySchema);
