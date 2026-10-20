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
  /** Untouched upload, kept when image_url is a background-removed version */
  original_image_url?: string | null;
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
  /** Code other users enter to join (visible to members only) */
  invite_code?: string;
  /** The signed-in user's role in this room */
  my_role?: 'owner' | 'member';
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

/** A room member as returned by get_room_members() */
export interface RoomMemberProfile {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  display_name: string;
  /** Profile picture from the member's account, when they have one */
  avatar_url?: string | null;
  /** Items this member shared into the room */
  shared_count: number;
  is_me: boolean;
}

/** A wardrobe item shared into a room, with who shared it */
export interface SharedRoomItem {
  item: WardrobeItem;
  shared_by: string;
  shared_at: string;
}

export type BorrowStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/** A row of public.borrow_requests */
export interface BorrowRequest {
  id: string;
  room_id: string;
  item_id: string;
  owner_id: string;
  requester_id: string;
  status: BorrowStatus;
  /** The requester's note */
  message: string | null;
  /** The owner's optional reply when accepting or declining (migration 007) */
  response_message?: string | null;
  created_at: string;
  responded_at: string | null;
  updated_at: string;
}

/** A row of public.room_messages */
export interface RoomMessage {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
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
