import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, RotateCcw, Undo2 } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "./hooks/use-mobile";
import { QuickSettings, type PreferencePage, type QuickSettingsProps } from "./quick-settings";
import { useI18n } from "./i18n";
import { settings } from "./settings/store";
import { useSettingsMeta } from "./settings/react";
import type { SectionId } from "./settings/definition";
import "./settings.css";

const ConfigEditor = lazy(() => import("./config-editor").then(module => ({ default: module.ConfigEditor })));
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

function SettingsPage({children, page, direction, reduced, scrollTop, onEntered}: {
  children: ReactNode; page: PreferencePage; direction: number; reduced: boolean; scrollTop: number; onEntered: () => void;
}) {
  const present = useIsPresent();
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (content.current) content.current.scrollTop = scrollTop; }, [scrollTop]);
  return <motion.div ref={content} className="settings-page" custom={direction} initial="enter" animate="visible" exit="exit"
    inert={!present || undefined} style={{zIndex:page === "root" ? 1 : 2}}
    // Transparent pages must travel edge-to-edge together, never over each other.
    variants={{enter:(d:number) => ({x:reduced ? 0 : d > 0 ? "100%" : "-100%"}),
      visible:{x:0}, exit:(d:number) => ({x:reduced ? 0 : d > 0 ? "-100%" : "100%"})}}
    transition={reduced ? {duration:0} : {duration:0.28,ease:[0.22,1,0.36,1]}}
    onAnimationComplete={definition => { if(present && definition === "visible") onEntered(); }}>
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
  const advanced = page === "advanced";
  const direction = useRef(1);
  const rootScroll = useRef(0);
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) { setReset(false); setPage("root"); rootScroll.current = 0; onPreviewChange(null); } }, [open, onPreviewChange]);
  const navigate = (next: PreferencePage) => {
    direction.current = next === "root" ? -1 : 1;
    if (next === "advanced") rootScroll.current = scroll.current?.querySelector<HTMLDivElement>(".settings-page:not([inert])")?.scrollTop ?? 0;
    setPage(next); setReset(false); setQuery(""); onPreviewChange(null);
  };
  const resetSection = (ids: readonly SectionId[]) => settings.resetSections(ids);
  return <MotionConfig reducedMotion={reduced ? "always" : "never"}><Drawer open={open} onOpenChange={onOpenChange} modal={false}
    swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} disablePointerDismissal>
    <DrawerContent className="settings-drawer" data-page={page} onKeyDown={event => { if(event.key === "Escape" && !event.defaultPrevented) onOpenChange(false); }}>
      <DrawerHeader className="settings-drawer__header">
        <div className="settings-navbar">
          {advanced ? <button ref={back} className="settings-back" aria-label={t("product.back")} onClick={() => navigate("root")}><ChevronLeft aria-hidden="true" /><span>{t("settings.button")}</span></button> : <DrawerTitle className="settings-large-title">{t("settings.title")}</DrawerTitle>}
          {advanced && <DrawerTitle>{t("advanced.title")}</DrawerTitle>}
          <button className="settings-done" aria-label={t("settings.close")} onClick={() => onOpenChange(false)}>{t("action.done")}</button>
        </div>
        <DrawerDescription>{t(advanced ? "advanced.hint" : "product.settingsHint")}</DrawerDescription>
      </DrawerHeader>
      <div ref={scroll} className="settings-scroll" data-base-ui-swipe-ignore>
        <AnimatePresence mode="sync" initial={false} custom={direction.current}>
          <SettingsPage key={page} page={page} direction={direction.current} reduced={reduced} scrollTop={advanced ? 0 : rootScroll.current}
            onEntered={() => { if(page !== "root") back.current?.focus({preventScroll:true});
              else scroll.current?.querySelector<HTMLButtonElement>('.settings-page:not([inert]) [data-preference="advanced"]')?.focus({preventScroll:true}); }}>
            {advanced ? <AdvancedBoundary fallback={<p role="alert" className="preference-note">{t("settings.loadFailed")}</p>}><Suspense fallback={<p role="status" className="preference-note">{t("settings.loading")}</p>}>
              <ConfigEditor query={query} onQueryChange={setQuery} onResetSection={resetSection}
                selectedFamily={selectedFamily} previewFamily={preview} onFamilyChange={index => {setSelectedFamily(index); if(preview !== null) onPreviewChange(index);}}
                onPreviewFamilyChange={onPreviewChange} />
            </Suspense></AdvancedBoundary> : <>
              <QuickSettings {...preferences} weather={meta.weather} rain={meta.rain}
                onAdvanced={() => navigate("advanced")}
                onWeatherChange={id => settings.setWeather(id)} onRainChange={on => settings.setRain(on)} />
            </>}
          </SettingsPage>
        </AnimatePresence>
      </div>
      <footer className="settings-drawer__footer">
        {reset ? <div className="settings-reset-confirm" role="group" aria-label={t("settings.resetConfirmLabel")}>
          <p>{t("settings.resetConfirm")}</p><div><button className="panel-button" onClick={() => setReset(false)}>{t("action.cancel")}</button>
          <button className="panel-button panel-button--danger" onClick={() => {settings.resetAll(); onPreviewChange(null); setReset(false);}}>{t("action.resetAll")}</button></div>
        </div> : <>
          <button className="panel-button" onClick={() => settings.undo()} disabled={!meta.canUndo}><Undo2 aria-hidden="true" />{t("action.undo")}</button>
          <button className="panel-button panel-button--reset" onClick={() => setReset(true)}><RotateCcw aria-hidden="true" />{t("action.resetAll")}</button>
        </>}
      </footer>
    </DrawerContent>
  </Drawer></MotionConfig>;
}
