const mongoose = require("mongoose");



const bankAccountSchema = new mongoose.Schema(

  {

    company_id: {

      type: mongoose.Schema.Types.ObjectId,

      ref: "company",

      required: true,

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

    nickname: {

      type: String,

      trim: true,

      default: "",

    },

    is_active: {

      type: Boolean,

      default: true,

    },

    current_balance: {

      type: Number,

      default: 0,

    },

  },

  {

    timestamps: true,

  }

);



module.exports = mongoose.model("BankAccount", bankAccountSchema);

