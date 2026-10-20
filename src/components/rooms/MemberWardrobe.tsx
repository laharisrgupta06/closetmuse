import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Shirt, RefreshCw } from "lucide-react";
import EmptyState from "../EmptyState";
import MemberAvatar from "../MemberAvatar";
import WardrobeCard, { WardrobeCardSkeleton } from "../WardrobeCard";
import ItemDetailModal from "../ItemDetailModal";
import { fetchMemberSharedItems } from "../../services/roomService";
import { CATEGORY_DEFINITIONS, getNormalizedCategory } from "../../utils/category";
import type { Room, RoomMemberProfile, SharedRoomItem, WardrobeItem } from "../../types";

type SortKey = "newest" | "oldest" | "name" | "category";

interface MemberWardrobeProps {
  room: Room;
  member: RoomMemberProfile;
  /** Something changed (e.g. an item was unshared): refresh counts */
  onChanged: () => void;
}

export default function MemberWardrobe({ room, member, onChanged }: MemberWardrobeProps) {
  const [shares, setShares] = useState<SharedRoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [openItem, setOpenItem] = useState<WardrobeItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setShares(await fetchMemberSharedItems(room.id, member.user_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load this wardrobe.");
    } finally {
      setLoading(false);
    }
  }, [room.id, member.user_id]);

  useEffect(() => {
    let active = true;
    fetchMemberSharedItems(room.id, member.user_id)
      .then((data) => active && setShares(data))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load this wardrobe."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [room.id, member.user_id]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of shares) {
      const cat = getNormalizedCategory(s.item);
      c.set(cat, (c.get(cat) ?? 0) + 1);
    }
    return c;
  }, [shares]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = shares.filter(
      (s) =>
        (filter === "all" || getNormalizedCategory(s.item) === filter) &&
        (!q ||
          [s.item.name, s.item.subcategory, s.item.color, s.item.material]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    );
    const order = CATEGORY_DEFINITIONS.map((c) => c.value as string);
    return [...list].sort((a, b) => {
      if (sort === "name") return a.item.name.localeCompare(b.item.name);
      if (sort === "category")
        return order.indexOf(getNormalizedCategory(a.item)) - order.indexOf(getNormalizedCategory(b.item)) ||
          a.item.name.localeCompare(b.item.name);
      const diff = new Date(b.shared_at).getTime() - new Date(a.shared_at).getTime();
      return sort === "newest" ? diff : -diff;
    });
  }, [shares, filter, search, sort]);

  const name = member.is_me ? "Your" : `${member.display_name}'s`;

  return (
    <div className="member-wardrobe">
      <div className="member-wardrobe-header panel">
        <MemberAvatar name={member.display_name} url={member.avatar_url} size={56} />
        <div>
          <h2 className="member-wardrobe-title">{name} wardrobe</h2>
          <div className="member-wardrobe-meta">
            {shares.length} item{shares.length !== 1 ? "s" : ""} shared in {room.name}
            {member.is_me ? " · only these are visible to members; the rest of your closet stays private" : ""}
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search className="search-icon" size={15} />
            <input
              className="search-input"
              type="search"
              placeholder={`Search ${member.is_me ? "your" : `${member.display_name}'s`} items…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search this wardrobe"
            />
          </div>
        </div>
        <div className="filter-chips">
          <button className={`filter-chip${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
            All ({shares.length})
          </button>
          {CATEGORY_DEFINITIONS.filter((c) => counts.has(c.value)).map((c) => (
            <button
              key={c.value}
              className={`filter-chip${filter === c.value ? " active" : ""}`}
              onClick={() => setFilter(c.value)}
            >
              {c.label} ({counts.get(c.value)})
            </button>
          ))}
        </div>
        <select
          className="form-select sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort items"
        >
          <option value="newest">Newest shared</option>
          <option value="oldest">Oldest shared</option>
          <option value="name">Name A–Z</option>
          <option value="category">Category</option>
        </select>
      </div>

      {loading ? (
        <div className="item-grid">
          {Array.from({ length: 6 }).map((_, i) => <WardrobeCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <EmptyState
          icon={Shirt}
          title="Couldn't load this wardrobe"
          description={error}
          action={<button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Retry</button>}
        />
      ) : shares.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title={member.is_me ? "You haven't shared anything here yet" : `${member.display_name} hasn't shared anything yet`}
          description={member.is_me ? "Use “Share your items” on the room page to choose pieces for this room." : "Their closet stays private until they choose items to share in this room."}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No items found" description="Try another category or search term." />
      ) : (
        <div className="item-grid" id="member-items">
          {visible.map(({ item }) => (
            <WardrobeCard key={item.id} item={item} onOpen={setOpenItem} />
          ))}
        </div>
      )}

      {openItem && (
        <ItemDetailModal
          item={openItem}
          isOwner={member.is_me}
          ownerName={member.display_name}
          onClose={() => setOpenItem(null)}
          showSharing={member.is_me}
          onUnshared={(roomId) => {
            if (roomId === room.id) {
              setShares((prev) => prev.filter((s) => s.item.id !== openItem.id));
              setOpenItem(null);
            }
            onChanged();
          }}
          borrowRoomId={member.is_me ? undefined : room.id}
        />
      )}
    </div>
  );
}
