const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'company',
    required: true,
    index: true
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'customer',
    required: true,
    index: true
  },
  customer_bank_account_id: {
    type: String,
    required: true,
    trim: true
  },
  customer_bank_name: {
    type: String,
    trim: true
  },
  customer_ifsc_code: {
    type: String,
    trim: true,
    uppercase: true
  },
  company_bank_account_id: {
    type: String,
    required: true,
    trim: true
  },
  company_bank_name: {
    type: String,
    trim: true
  },
  company_ifsc_code: {
    type: String,
    trim: true,
    uppercase: true
  },
  transfer_amount: {
    type: Number,
    required: true,
    min: 0
  },
  transaction_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
