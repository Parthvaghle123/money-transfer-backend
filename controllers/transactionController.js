const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Company = require('../models/Company');

// Get all transactions
const getAllTransactions = async (req, res) => {
  try {
    const { date, startDate, endDate, customerId, companyId } = req.query;
    let query = {};

    // Date filtering
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.transaction_date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate || endDate) {
      query.transaction_date = {};
      if (startDate) {
        query.transaction_date.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfRange = new Date(endDate);
        endOfRange.setHours(23, 59, 59, 999);
        query.transaction_date.$lte = endOfRange;
      }
    }

    if (customerId) query.customer_id = customerId;
    if (companyId) query.company_id = companyId;

    const transactions = await Transaction.find(query)
      // Customer model contains `customer_name` and `mobile_number` (not firstName/lastName/email)
      .populate('customer_id', 'customer_name mobile_number nickname')
      .populate('company_id', 'name')
      .populate('created_by', 'firstName lastName')
      .sort({ created_at: -1 });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('customer_id', 'customer_name mobile_number nickname')
      .populate('company_id', 'name phone jurisdiction')
      .populate('created_by', 'firstName lastName email');
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create new transaction
const createTransaction = async (req, res) => {
  try {
    const {
      company_id,
      customer_id,
      customer_bank_account_id,
      company_bank_account_id,
      transfer_amount,
      notes
    } = req.body;

    // Validate required fields
    if (!company_id || !customer_id || !customer_bank_account_id || !company_bank_account_id || !transfer_amount) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Validate amount
    if (transfer_amount <= 0) {
      return res.status(400).json({ error: 'Transfer amount must be greater than 0' });
    }

    // Check if customer exists
    const customer = await User.findById(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if company exists
    const company = await Company.findById(company_id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const transaction = new Transaction({
      company_id,
      customer_id,
      customer_bank_account_id,
      company_bank_account_id,
      transfer_amount,
      notes,
      created_by: req.user.id, // Assuming user is authenticated and available in req.user
      status: 'pending'
    });

    const savedTransaction = await transaction.save();
    
    // Populate the response with related data
    const populatedTransaction = await Transaction.findById(savedTransaction._id)
      .populate('customer_id', 'customer_name mobile_number nickname')
      .populate('company_id', 'name')
      .populate('created_by', 'firstName lastName');

    res.status(201).json(populatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update transaction status
const updateTransactionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('customer_id', 'customer_name mobile_number nickname')
     .populate('company_id', 'name')
     .populate('created_by', 'firstName lastName');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete transaction
const deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndDelete(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get transactions by customer
const getTransactionsByCustomer = async (req, res) => {
  try {
    const transactions = await Transaction.find({ customer_id: req.params.customerId })
      .populate('customer_id', 'customer_name mobile_number nickname')
      .populate('company_id', 'name')
      .populate('created_by', 'firstName lastName')
      .sort({ created_at: -1 });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get transactions by company
const getTransactionsByCompany = async (req, res) => {
  try {
    const transactions = await Transaction.find({ company_id: req.params.companyId })
      .populate('customer_id', 'customer_name mobile_number nickname')
      .populate('company_id', 'name')
      .populate('created_by', 'firstName lastName')
      .sort({ created_at: -1 });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransactionStatus,
  deleteTransaction,
  getTransactionsByCustomer,
  getTransactionsByCompany
};
