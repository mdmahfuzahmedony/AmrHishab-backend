import { Router } from "express";
import {
  listPublicShops,
  getPublicShopDetails,
} from "../controllers/public.controller.js";

const router = Router();

router.get("/shops", listPublicShops);
router.get("/shops/:shopId", getPublicShopDetails);

export default router;
