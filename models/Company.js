const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true, required: true },
    name: { type: String, required: true, trim: true },
    phone: { 
      type: String, 
      required: true, 
      trim: true,
      validate: {
        validator: function(v) {
          // Accept only 10 digits (no spaces, dashes, or other characters)
          return /^\d{10}$/.test(v);
        },
        message: props => `${props.value} is not a valid 10-digit phone number!`
      }
    },
    paymentDueDays: { type: Number, default: 30 },
    jurisdiction: { type: String, default: "", trim: true },
    standardRules: { type: [String], default: [] },
    additionalNotes: { type: String, default: "", trim: true },
    extraRules: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    logoDataUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("company", CompanySchema);

