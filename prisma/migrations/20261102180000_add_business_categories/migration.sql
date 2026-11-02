CREATE TABLE "BusinessCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "englishName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'Store',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessCategory_name_key" ON "BusinessCategory"("name");
CREATE UNIQUE INDEX "BusinessCategory_englishName_key" ON "BusinessCategory"("englishName");
CREATE INDEX "BusinessCategory_isActive_sortOrder_idx" ON "BusinessCategory"("isActive", "sortOrder");

ALTER TABLE "User" ADD COLUMN "businessCategoryId" TEXT;
CREATE INDEX "User_businessCategoryId_idx" ON "User"("businessCategoryId");
ALTER TABLE "User"
ADD CONSTRAINT "User_businessCategoryId_fkey"
FOREIGN KEY ("businessCategoryId") REFERENCES "BusinessCategory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BusinessCategory" ("id", "name", "englishName", "description", "icon", "sortOrder", "updatedAt") VALUES
('bc_grocery', 'মুদি দোকান', 'Grocery Store', 'নিত্যপ্রয়োজনীয় পণ্যের দোকান', 'ShoppingBasket', 1, CURRENT_TIMESTAMP),
('bc_clothing', 'কাপড়ের দোকান', 'Clothing Store', 'কাপড় ও পোশাকের দোকান', 'Shirt', 2, CURRENT_TIMESTAMP),
('bc_electronics', 'ইলেকট্রনিকস', 'Electronics', 'ইলেকট্রনিক পণ্য ও যন্ত্রপাতির দোকান', 'Monitor', 3, CURRENT_TIMESTAMP),
('bc_pharmacy', 'ফার্মেসি', 'Pharmacy', 'ঔষধ ও স্বাস্থ্যসামগ্রীর দোকান', 'Pill', 4, CURRENT_TIMESTAMP),
('bc_hardware', 'হার্ডওয়্যার', 'Hardware Store', 'হার্ডওয়্যার ও যন্ত্রাংশের দোকান', 'Hammer', 5, CURRENT_TIMESTAMP),
('bc_mobile', 'মোবাইল ও এক্সেসরিজ', 'Mobile & Accessories', 'মোবাইল ফোন ও এক্সেসরিজের দোকান', 'Smartphone', 6, CURRENT_TIMESTAMP),
('bc_stationery', 'স্টেশনারি', 'Stationery', 'স্টেশনারি ও শিক্ষা উপকরণের দোকান', 'BookOpen', 7, CURRENT_TIMESTAMP),
('bc_cosmetics', 'কসমেটিকস', 'Cosmetics', 'প্রসাধনী ও সৌন্দর্যসামগ্রীর দোকান', 'Sparkles', 8, CURRENT_TIMESTAMP),
('bc_furniture', 'ফার্নিচার', 'Furniture Store', 'আসবাবপত্রের দোকান', 'Armchair', 9, CURRENT_TIMESTAMP),
('bc_restaurant', 'রেস্টুরেন্ট ও খাবার', 'Restaurant & Food', 'রেস্টুরেন্ট ও খাবারের ব্যবসা', 'Utensils', 10, CURRENT_TIMESTAMP),
('bc_agriculture', 'কৃষি উপকরণ', 'Agricultural Supplies', 'কৃষি উপকরণ, বীজ ও সার বিক্রির দোকান', 'Sprout', 11, CURRENT_TIMESTAMP),
('bc_shoes', 'জুতার দোকান', 'Footwear Store', 'জুতা ও স্যান্ডেলের দোকান', 'Footprints', 12, CURRENT_TIMESTAMP),
('bc_jewelry', 'স্বর্ণ ও জুয়েলারি', 'Jewelry Store', 'স্বর্ণ ও গহনার দোকান', 'Gem', 13, CURRENT_TIMESTAMP),
('bc_bakery', 'বেকারি ও মিষ্টির দোকান', 'Bakery & Sweets', 'বেকারি, মিষ্টি ও ডেজার্টের দোকান', 'CakeSlice', 14, CURRENT_TIMESTAMP),
('bc_toys', 'খেলনার দোকান', 'Toy Store', 'খেলনা ও শিশুদের সামগ্রীর দোকান', 'ToyBrick', 15, CURRENT_TIMESTAMP),
('bc_construction', 'নির্মাণসামগ্রী', 'Construction Supplies', 'নির্মাণসামগ্রী ও building materials-এর দোকান', 'Construction', 16, CURRENT_TIMESTAMP),
('bc_online', 'অনলাইন শপ', 'Online Shop', 'অনলাইনে পণ্য বিক্রির ব্যবসা', 'ShoppingBag', 17, CURRENT_TIMESTAMP),
('bc_other', 'অন্যান্য ব্যবসা', 'Other Business', 'অন্যান্য ধরনের ব্যবসা', 'Store', 18, CURRENT_TIMESTAMP);
