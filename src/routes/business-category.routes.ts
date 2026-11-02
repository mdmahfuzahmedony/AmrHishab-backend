import { Router } from "express";
import {
  getActiveBusinessCategory,
  listActiveBusinessCategories,
} from "../controllers/business-category.controller.js";

const router = Router();

router.get("/", listActiveBusinessCategories);
router.get("/:id", getActiveBusinessCategory);

export default router;
