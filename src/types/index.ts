// Wardrobe item categories
export type GarmentCategory =
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'outerwear'
  | 'footwear'
  | 'accessories'
  | 'bags'
  | 'jewellery'
  | 'other';

export type GarmentOccasion =
  | 'everyday'
  | 'work'
  | 'formal'
  | 'casual'
  | 'evening'
  | 'occasion'
  | 'active'
  | 'beach'
  | 'travel';

export type GarmentStyle =
  | 'classic'
  | 'minimalist'
  | 'bohemian'
  | 'preppy'
  | 'streetwear'
  | 'romantic'
  | 'edgy'
  | 'sophisticated'
  | 'eclectic';

export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string;
  category: GarmentCategory;
  /** "Traditional" | "Western" | "Unknown" — top-level taxonomy branch */
  style_branch?: string;
  /** Specific garment type, e.g. "Saree", "Kurti", "Jeans", "Sneakers" */
  subcategory?: string;
  color: string;
  material?: string;
  pattern?: string;
  occasion?: GarmentOccasion;
  style?: GarmentStyle;
  brand?: string;
  notes?: string;
  image_url?: string;
  is_favorite: boolean;
  is_shared: boolean;
  room_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface Outfit {
  id: string;
  user_id: string;
  name: string;
  items: string[]; // WardrobeItem IDs
  occasion?: GarmentOccasion;
  notes?: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  passcode?: string;
  member_count: number;
  item_count: number;
  is_private: boolean;
  cover_image_url?: string;
  created_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface BorrowRequest {
  id: string;
  item_id: string;
  requester_id: string;
  owner_id: string;
  room_id: string;
  status: 'pending' | 'approved' | 'declined' | 'returned';
  message?: string;
  requested_date?: string;
  return_date?: string;
  created_at: string;
}

export interface StylistRequest {
  id: string;
  user_id: string;
  occasion: GarmentOccasion;
  style_preference?: GarmentStyle;
  wardrobe_source: 'my_closet' | 'room';
  room_id?: string;
  additional_notes?: string;
  status: 'pending' | 'completed' | 'failed';
  result?: StylistResult;
  created_at: string;
}

export interface StylistResult {
  outfit_items: string[];
  styling_notes: string;
  alternative_looks?: string[][];
}

export interface UserProfile {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  style_preferences?: GarmentStyle[];
  created_at: string;
}

// UI state types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  status: LoadingState;
  error: string | null;
}
