import { Router } from "express";
import {
  createVendorCategory,
  createVendorCategoriesBatch,
  addCustomerLedgerEntry,
  createVendorCustomer,
  createVendorProduct,
  deleteVendorCategory,
  deleteVendorProduct,
  getVendorCategories,
  getVendorCustomerLedger,
  getVendorCustomers,
  getVendorProducts,
  getVendorShop,
  updateVendorCategory,
  updateVendorCustomer,
  updateVendorProduct,
  requestVendorLocationChange,
  updateVendorShopAvailability,
  updateVendorShopDelivery,
  updateVendorShopName,
  searchVendorCustomerByPhone,
  createVendorSale,
  getVendorCustomerSales,
  createCustomerInviteLink,
  getVendorProfitReport,
  getVendorDashboard,
} from "../controllers/vendor.controller.js";
import { requireAuth, requireVendor } from "../middleware/auth.middleware.js";
import {
  listVendorOrders,
  updateVendorOrderStatus,
} from "../controllers/order.controller.js";

const router = Router();

router.patch("/shop", requireAuth, updateVendorShopName);
router.get("/shop", requireAuth, getVendorShop);
router.get("/dashboard", requireAuth, requireVendor, getVendorDashboard);
router.get("/orders", requireAuth, requireVendor, listVendorOrders);
router.patch(
  "/orders/:orderId/status",
  requireAuth,
  requireVendor,
  updateVendorOrderStatus,
);
router.patch("/shop/availability", requireAuth, updateVendorShopAvailability);
router.patch("/shop/delivery", requireAuth, updateVendorShopDelivery);
router.post("/shop/location-request", requireAuth, requestVendorLocationChange);

router.get("/categories", requireAuth, requireVendor, getVendorCategories);
router.post("/categories", requireAuth, requireVendor, createVendorCategory);
router.post("/categories/batch", requireAuth, requireVendor, createVendorCategoriesBatch);
router.patch("/categories/:categoryId", requireAuth, requireVendor, updateVendorCategory);
router.delete("/categories/:categoryId", requireAuth, requireVendor, deleteVendorCategory);

router.get("/products", requireAuth, requireVendor, getVendorProducts);
router.post("/products", requireAuth, requireVendor, createVendorProduct);
router.patch("/products/:productId", requireAuth, requireVendor, updateVendorProduct);
router.delete("/products/:productId", requireAuth, requireVendor, deleteVendorProduct);

router.get("/customers/search", requireAuth, requireVendor, searchVendorCustomerByPhone);
router.get("/customers", requireAuth, requireVendor, getVendorCustomers);
router.post("/customers", requireAuth, requireVendor, createVendorCustomer);
router.patch("/customers/:customerId", requireAuth, requireVendor, updateVendorCustomer);
router.get("/customers/:customerId/ledger", requireAuth, requireVendor, getVendorCustomerLedger);
router.post("/customers/:customerId/ledger", requireAuth, requireVendor, addCustomerLedgerEntry);
router.post("/customers/:customerId/sales", requireAuth, requireVendor, createVendorSale);
router.get("/customers/:customerId/sales", requireAuth, requireVendor, getVendorCustomerSales);
router.post("/customers/:customerId/invite", requireAuth, requireVendor, createCustomerInviteLink);
router.get("/reports/profit", requireAuth, requireVendor, getVendorProfitReport);

export default router;
