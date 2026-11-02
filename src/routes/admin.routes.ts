import { Router } from "express";
import {
  createBusinessCategory,
  deleteBusinessCategory,
  listAdminBusinessCategories,
  updateBusinessCategory,
  updateBusinessCategoryStatus,
  updateVendorBusinessCategory,
} from "../controllers/business-category.controller.js";
import {
  deleteVendor,
  getDashboard,
  listVendorLocationRequests,
  listShops,
  listUsers,
  reviewVendorLocationRequest,
  updateVendorStatus,
} from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/business-categories", requireAuth, listAdminBusinessCategories);
router.post("/business-categories", requireAuth, createBusinessCategory);
router.put("/business-categories/:id", requireAuth, updateBusinessCategory);
router.patch(
  "/business-categories/:id/status",
  requireAuth,
  updateBusinessCategoryStatus,
);
router.delete("/business-categories/:id", requireAuth, deleteBusinessCategory);
router.patch(
  "/shops/:userId/business-category",
  requireAuth,
  updateVendorBusinessCategory,
);
router.get("/dashboard", requireAuth, getDashboard);
router.get("/users", requireAuth, listUsers);
router.get("/shops/location-requests", requireAuth, listVendorLocationRequests);
router.get("/shops", requireAuth, listShops);
router.patch(
  "/shops/:userId/location-request",
  requireAuth,
  reviewVendorLocationRequest,
);
router.patch("/users/:userId/status", requireAuth, updateVendorStatus);
router.delete("/users/:userId", requireAuth, deleteVendor);

export default router;
