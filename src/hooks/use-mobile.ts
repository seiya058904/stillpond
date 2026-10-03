import { useEffect, useState } from "react";

// Match the sheet's CSS breakpoint. A wide touch screen still has room for
// the side panel, especially a phone rotated to landscape.
const MOBILE_QUERY = "(max-width: 767px)";

function readMobileQuery(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(readMobileQuery);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const update = (): void => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}
