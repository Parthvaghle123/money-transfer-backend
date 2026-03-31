const mongoose = require('mongoose');

const roleAssignmentSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'staff'],
    required: true
  },
  permissions: {
    type: [String],
    default: []
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  // To link with actual User if needed, though for now we follow the requirement of saving this data
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Ensure unique email per company for these role assignments
roleAssignmentSchema.index({ email: 1, company_id: 1 }, { unique: true });

const RoleAssignment = mongoose.model('RoleAssignment', roleAssignmentSchema);

module.exports = RoleAssignment;
