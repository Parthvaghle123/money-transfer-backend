const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
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
    nickname: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "company",
      required: true,
    },
    customer_name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile_number: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v) {
          return /^\d{10}$/.test(v);
        },
        message: 'Mobile number must be exactly 10 digits'
      }
    },
    customer_email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },
    customer_address: {
      type: String,
      required: false,
      trim: true,
    },
    // Legacy single bank fields (kept for backward compat)
    bank_name: {
      type: String,
      trim: true,
    },
    account_number: {
      type: String,
      trim: true,
    },
    ifsc_code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    nickname: {
      type: String,
      trim: true,
      default: "",
    },
    // Multiple bank accounts
    bank_accounts: {
      type: [bankAccountSchema],
      default: [],
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("customer", customerSchema);
