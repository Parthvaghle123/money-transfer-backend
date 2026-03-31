const mongoose = require("mongoose");

const DenominationHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true, required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", index: true, required: true },
    type: { type: String, enum: ["DEPOSIT", "WITHDRAW"], required: true },
    denominations: {
      2000: { type: Number, default: 0 },
      500: { type: Number, default: 0 },
      200: { type: Number, default: 0 },
      100: { type: Number, default: 0 },
      50: { type: Number, default: 0 },
      20: { type: Number, default: 0 },
      10: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      1: { type: Number, default: 0 },
    },
    totalAmount: { type: Number, required: true },
    remarks: { type: String, trim: true },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("denomination_history", DenominationHistorySchema);
