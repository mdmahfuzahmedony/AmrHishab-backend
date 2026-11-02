import { Router } from "express";
import {
  register,
  login,
  logout,
  me,
  getInviteDetails,
  setupCustomerAccount,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.get("/invite/:token", getInviteDetails);
router.post("/setup-account", setupCustomerAccount);

export default router;
