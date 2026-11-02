import { Router } from "express";
import {
  getCustomerDashboard,
  getCustomerShops,
  getCustomerTransactions,
} from "../controllers/customer.controller.js";
import { requireAuth, requireCustomer } from "../middleware/auth.middleware.js";
import { createCustomerOrder } from "../controllers/order.controller.js";

const router = Router();

router.get("/dashboard", requireAuth, requireCustomer, getCustomerDashboard);
router.get("/shops", requireAuth, requireCustomer, getCustomerShops);
router.get("/transactions", requireAuth, requireCustomer, getCustomerTransactions);
router.post("/orders", requireAuth, requireCustomer, createCustomerOrder);

export default router;
