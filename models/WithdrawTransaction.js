const mongoose = require("mongoose");

const WithdrawTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "company",
      required: true,
      index: true,
    },
    bank_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
    },
    company_name: {
      type: String,
      required: true,
      trim: true,
    },
    bank_name: {
      type: String,
      required: true,
      trim: true,
    },
    account_number: {
      type: String,
      required: true,
      trim: true,
    },
    ifsc_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    withdraw_amount: {
      type: Number,
      required: true,
      min: 1,
    },
    remark: {
      type: String,
      trim: true,
      default: "",
    },
    denomination_snapshot: {
      type: Object,
      default: {},
    },
    transaction_date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WithdrawTransaction", WithdrawTransactionSchema);
