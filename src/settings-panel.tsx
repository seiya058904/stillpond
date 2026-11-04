import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Undo2 } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "./hooks/use-mobile";
import { QuickSettings, type QuickSettingsProps } from "./quick-settings";
import { useI18n } from "./i18n";
import { settings } from "./settings/store";
import { useSettingsMeta } from "./settings/react";
import type { SectionId } from "./settings/definition";
import { pageDepth, pageGroup, parentPage, type PreferencePage } from "./settings/navigation";
import "./settings.css";

const loadConfigEditor = () => import("./config-editor").then(module => ({ default: module.ConfigEditor }));
const ConfigEditor = lazy(loadConfigEditor);
class AdvancedBoundary extends Component<{children:ReactNode; fallback:ReactNode}, {failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
interface Props extends Pick<QuickSettingsProps, "sound" | "frameRate" | "onFrameRateChange" | "ambient" | "onAmbientChange"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: number | null;
  onPreviewChange: (index: number | null) => void;
}

// The distance a large title scrolls before the bar takes over as the title.
const TITLE_COLLAPSE = 34;
// Close to the UIKit navigation push: quick to leave, settling without an overshoot.
const PUSH = {type: "spring", stiffness: 420, damping: 44, mass: 1} as const;

function SettingsPage({children, page, direction, reduced, scrollTop, onEntered, onScrolled, title, subtitle}: {
  children: ReactNode; page: PreferencePage; direction: number; reduced: boolean; scrollTop: number; onEntered: () => void; onScrolled: (top: number) => void; title: string; subtitle: string;
}) {
  const present = useIsPresent();
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!content.current) return;
    content.current.scrollTop = scrollTop;
    onScrolled(content.current.scrollTop);
    // Restoring a position is part of arriving; only ever runs for a new page.
  }, [scrollTop]);
  return <motion.div ref={content} className="settings-page" custom={direction} initial="enter" animate="visible" exit="exit"
    inert={!present || undefined} style={{zIndex:pageDepth(page) + 1}}
    onScroll={event => { if (present) onScrolled(event.currentTarget.scrollTop); }}
    // Transparent pages must travel edge-to-edge together, never over each other.
    variants={{enter:(d:number) => ({x:reduced ? 0 : d > 0 ? "100%" : "-100%"}),
      visible:{x:0}, exit:(d:number) => ({x:reduced ? 0 : d > 0 ? "-100%" : "100%"})}}
    transition={reduced ? {duration:0} : PUSH}
    onAnimationComplete={definition => { if(present && definition === "visible") onEntered(); }}>
    <div className="settings-large-title" aria-hidden="true">{title}</div>
    <p className="settings-subtitle" aria-hidden="true">{subtitle}</p>
    {children}
  </motion.div>;
}

export default function SettingsPanel({open, onOpenChange, preview, onPreviewChange, ...preferences}: Props) {
  const {t} = useI18n();
  const mobile = useIsMobile();
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    // Motion's current hook samples once; OS preference changes must apply live.
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const meta = useSettingsMeta();
  const [page, setPage] = useState<PreferencePage>("root");
  const group = pageGroup(page);
  const direction = useRef(1);
  const scrollMemory = useRef<Partial<Record<PreferencePage, number>>>({});
  const focusTarget = useRef<string | null>(null);
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const lastEscape = useRef(-1);
  const activePage = () => scroll.current?.querySelector<HTMLDivElement>(".settings-page:not([inert])") ?? null;

  // Fetch the editor as soon as the panel exists, so Advanced opens at once and
  // survives the network or server going away afterward. A failure here is not
  // reported: it only matters if Advanced is opened, and the boundary covers that.
  useEffect(() => { loadConfigEditor().catch(() => undefined); }, []);
  useEffect(() => { if (!open) { setReset(false); setPage("root"); scrollMemory.current = {}; focusTarget.current = null; onPreviewChange(null); } }, [open, onPreviewChange]);
  // Effects run after the list stops being inert, so focus can actually land on it.
  const sheetWasOpen = useRef(false);
  useEffect(() => {
    if (reset) cancel.current?.focus({preventScroll:true});
    else if (sheetWasOpen.current) activePage()?.querySelector<HTMLButtonElement>('[data-preference="reset"]')?.focus({preventScroll:true});
    sheetWasOpen.current = reset;
  }, [reset]);

  const navigate = (next: PreferencePage) => {
    const forward = pageDepth(next) > pageDepth(page);
    direction.current = forward ? 1 : -1;
    if (forward) scrollMemory.current[page] = activePage()?.scrollTop ?? 0;
    else delete scrollMemory.current[page];
    // Going back returns focus to the row that opened the page we are leaving.
    focusTarget.current = forward ? "back" : page === "advanced" ? '[data-preference="advanced"]' : `[data-group="${pageGroup(page)}"]`;
    setPage(next); setReset(false); setQuery(""); onPreviewChange(null);
  };
  const closeReset = () => setReset(false);
  // Escape reaches here from both the popup and Base UI's document listener.
  const dismiss = (stamp: number) => {
    if (stamp === lastEscape.current) return;
    lastEscape.current = stamp;
    if (reset) closeReset();
    else if (page !== "root") navigate(parentPage(page));
    else onOpenChange(false);
  };
  const resetSection = (ids: readonly SectionId[]) => settings.resetSections(ids);
  const title = page === "root" ? t("settings.title") : group ? t(`section.${group}`) : t("advanced.title");
  const subtitle = page === "root" ? t("product.settingsHint") : group ? t(`group.${group}`) : t("advanced.hint");
  const backLabel = page === "advanced" ? t("settings.button") : t("advanced.title");

  return <MotionConfig reducedMotion={reduced ? "always" : "never"}><Drawer open={open} modal={false}
    onOpenChange={(next, details) => {
      if (!next && details.reason === "escape-key") { dismiss(details.event.timeStamp); return; }
      onOpenChange(next);
    }}
    swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} disablePointerDismissal>
    <DrawerContent className="settings-drawer" data-page={page} onKeyDown={event => { if(event.key === "Escape" && !event.defaultPrevented) dismiss(event.nativeEvent.timeStamp); }}>
      <DrawerHeader ref={header} className="settings-navbar" inert={reset || undefined}>
        <div className="settings-navbar__leading">
          {page !== "root" && <button ref={back} className="settings-nav-button settings-back" aria-label={t(page === "advanced" ? "product.back" : "product.backAdvanced")} onClick={() => navigate(parentPage(page))}><ChevronLeft aria-hidden="true" /><span>{backLabel}</span></button>}
        </div>
        <DrawerTitle className="settings-navbar__title">{title}</DrawerTitle>
        <div className="settings-navbar__trailing">
          <button className="settings-nav-button settings-nav-button--icon" aria-label={t("action.undo")} disabled={!meta.canUndo} onClick={() => settings.undo()}><Undo2 aria-hidden="true" /></button>
          <button className="settings-nav-button settings-done" aria-label={t("settings.close")} onClick={() => onOpenChange(false)}>{t("action.done")}</button>
        </div>
        <DrawerDescription className="sr-only">{subtitle}</DrawerDescription>
      </DrawerHeader>
      <div ref={scroll} className="settings-scroll" data-base-ui-swipe-ignore inert={reset || undefined}>
        <AnimatePresence mode="sync" initial={false} custom={direction.current}>
          <SettingsPage key={page} page={page} direction={direction.current} reduced={reduced} title={title} subtitle={subtitle}
            scrollTop={scrollMemory.current[page] ?? 0}
            onScrolled={top => { if (header.current) header.current.dataset.scrolled = String(top > TITLE_COLLAPSE); }}
            onEntered={() => {
              const target = focusTarget.current;
              focusTarget.current = null;
              if (target === "back") back.current?.focus({preventScroll:true});
              else if (target) activePage()?.querySelector<HTMLButtonElement>(target)?.focus({preventScroll:true});
            }}>
            {page !== "root" ? <AdvancedBoundary fallback={<div className="preference-group" role="alert">
              <div className="preference-card"><button type="button" className="preference-row preference-row--button settings-reload" onClick={() => window.location.reload()}>{t("action.reload")}</button></div>
              {/* A failed import stays failed in this page, and a deployment can remove the file, so only a reload recovers. */}
              <p className="preference-note">{t("settings.advancedFailed")}</p>
            </div>}><Suspense fallback={<p role="status" className="preference-note">{t("settings.loading")}</p>}>
              <ConfigEditor groupId={group} onOpenGroup={id => navigate(`advanced/${id}`)} query={query} onQueryChange={setQuery} onResetSection={resetSection}
                selectedFamily={selectedFamily} previewFamily={preview} onFamilyChange={index => {setSelectedFamily(index); if(preview !== null) onPreviewChange(index);}}
                onPreviewFamilyChange={onPreviewChange} />
            </Suspense></AdvancedBoundary> : <QuickSettings {...preferences} weather={meta.weather} rain={meta.rain}
                onAdvanced={() => navigate("advanced")} onReset={() => setReset(true)}
                onWeatherChange={id => settings.setWeather(id)} onRainChange={on => settings.setRain(on)} />}
          </SettingsPage>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {reset && <motion.div key="scrim" className="settings-sheet-scrim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced ? 0 : 0.2}} onClick={closeReset}>
          <motion.div className="settings-sheet" role="alertdialog" aria-modal="true" aria-label={t("settings.resetConfirmLabel")} aria-describedby="settings-reset-message"
            initial={{y:reduced ? 0 : "110%"}} animate={{y:0}} exit={{y:reduced ? 0 : "110%"}} transition={reduced ? {duration:0} : PUSH} onClick={event => event.stopPropagation()}>
            <div className="settings-sheet__group">
              <p id="settings-reset-message">{t("settings.resetConfirm")}</p>
              <button className="settings-sheet__action settings-sheet__action--danger" onClick={() => {settings.resetAll(); onPreviewChange(null); closeReset();}}>{t("action.resetAll")}</button>
            </div>
            <button ref={cancel} className="settings-sheet__action settings-sheet__cancel" onClick={closeReset}>{t("action.cancel")}</button>
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </DrawerContent>
  </Drawer></MotionConfig>;
}
