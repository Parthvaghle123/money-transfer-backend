const express = require('express');
const router = express.Router();
const {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransactionStatus,
  deleteTransaction,
  getTransactionsByCustomer,
  getTransactionsByCompany
} = require('../controllers/transactionController');

// Middleware for authentication (you can implement this based on your auth system)
const authenticateUser = (req, res, next) => {
  // Implement your authentication logic here
  // For now, we'll just pass through
  next();
};

// GET /api/transactions - Get all transactions
router.get('/', authenticateUser, getAllTransactions);

// GET /api/transactions/:id - Get transaction by ID
router.get('/:id', authenticateUser, getTransactionById);

// POST /api/transactions - Create new transaction
router.post('/', authenticateUser, createTransaction);

// PUT /api/transactions/:id/status - Update transaction status
router.put('/:id/status', authenticateUser, updateTransactionStatus);

// DELETE /api/transactions/:id - Delete transaction
router.delete('/:id', authenticateUser, deleteTransaction);

// GET /api/transactions/customer/:customerId - Get transactions by customer
router.get('/customer/:customerId', authenticateUser, getTransactionsByCustomer);

// GET /api/transactions/company/:companyId - Get transactions by company
router.get('/company/:companyId', authenticateUser, getTransactionsByCompany);

module.exports = router;
