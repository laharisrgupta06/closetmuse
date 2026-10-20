import { useEffect, useState } from "react";
import { hasDesignTraditionColumn } from "../../services/wardrobeService";

/** null while checking; false before migration 008 */
export function useTraditionColumn(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    hasDesignTraditionColumn().then((ok) => live && setAvailable(ok));
    return () => {
      live = false;
    };
  }, []);
  return available;
}
