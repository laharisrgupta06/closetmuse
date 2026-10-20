// Category rules live with the Edge Functions so the AI Stylist uses exactly
// the same taxonomy as the app.
export {
  CATEGORY_DEFINITIONS,
  BAG_KEYWORDS,
  JEWELLERY_KEYWORDS,
  FOOTWEAR_KEYWORDS,
  DRESS_KEYWORDS,
  BOTTOM_KEYWORDS,
  OUTERWEAR_KEYWORDS,
  TOP_KEYWORDS,
  ACCESSORY_KEYWORDS,
  inferCategoryFromText,
  getNormalizedCategory,
} from "../../supabase/functions/_shared/category.ts";
