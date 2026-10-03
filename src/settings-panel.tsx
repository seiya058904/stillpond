import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, RotateCcw, Undo2 } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useIsPresent } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "./hooks/use-mobile";
import { QuickSettings, preferenceTitles, type PreferencePage, type QuickSettingsProps } from "./quick-settings";
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

function SettingsPage({children, page, direction, reduced, onEntered}: {
  children: ReactNode; page: PreferencePage; direction: number; reduced: boolean; onEntered: () => void;
}) {
  const present = useIsPresent();
  return <motion.div className="settings-page" custom={direction} initial="enter" animate="visible" exit="exit"
    inert={!present || undefined} style={{zIndex:page === "root" ? 1 : 2}}
    variants={{enter:(d:number) => ({opacity:reduced ? 1 : 0.6,x:reduced ? 0 : d > 0 ? "100%" : "-22%"}),
      visible:{opacity:1,x:0}, exit:(d:number) => ({opacity:reduced ? 1 : 0.4,x:reduced ? 0 : d > 0 ? "-22%" : "100%"})}}
    transition={reduced ? {duration:0} : {type:"spring",stiffness:360,damping:38,mass:0.9}}
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
  const returnTo = useRef<PreferencePage>("pond");
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) { setReset(false); setPage("root"); onPreviewChange(null); } }, [open, onPreviewChange]);
  const navigate = (next: PreferencePage) => {
    direction.current = next === "root" ? -1 : 1;
    if (next !== "root") returnTo.current = next;
    setPage(next); setReset(false); setQuery(""); onPreviewChange(null);
    scroll.current?.scrollTo({top:0});
  };
  const resetSection = (ids: readonly SectionId[]) => settings.resetSections(ids);
  return <MotionConfig reducedMotion={reduced ? "always" : "never"}><Drawer open={open} onOpenChange={onOpenChange} modal={false}
    swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} disablePointerDismissal>
    <DrawerContent className="settings-drawer" data-page={page} onKeyDown={event => { if(event.key === "Escape") onOpenChange(false); }}>
      <DrawerHeader className="settings-drawer__header">
        <div className="settings-navbar">
          {page !== "root" ? <button ref={back} className="settings-back" aria-label={t("product.back")} onClick={() => navigate("root")}><ChevronLeft aria-hidden="true" /><span>{t("settings.button")}</span></button> : <span />}
          {page !== "root" && <DrawerTitle>{t(preferenceTitles[page])}</DrawerTitle>}
          <button className="settings-done" aria-label={t("settings.close")} onClick={() => onOpenChange(false)}>{t("action.done")}</button>
        </div>
        {page === "root" && <DrawerTitle className="settings-large-title">{t("settings.title")}</DrawerTitle>}
        <DrawerDescription className={page !== "root" && !advanced ? "sr-only" : undefined}>{t(advanced ? "advanced.hint" : "product.settingsHint")}</DrawerDescription>
      </DrawerHeader>
      <div ref={scroll} className="settings-scroll" data-base-ui-swipe-ignore>
        <AnimatePresence mode="sync" initial={false} custom={direction.current}>
          <SettingsPage key={page} page={page} direction={direction.current} reduced={!!reduced}
            onEntered={() => { if(page !== "root") back.current?.focus({preventScroll:true});
              else scroll.current?.querySelector<HTMLButtonElement>(`[data-preference="${returnTo.current}"]`)?.focus({preventScroll:true}); }}>
            {advanced ? <AdvancedBoundary fallback={<p role="alert" className="preference-note">{t("settings.loadFailed")}</p>}><Suspense fallback={<p role="status" className="preference-note">{t("settings.loading")}</p>}>
              <ConfigEditor query={query} onQueryChange={setQuery} onResetSection={resetSection}
                selectedFamily={selectedFamily} previewFamily={preview} onFamilyChange={index => {setSelectedFamily(index); onPreviewChange(index);}}
                onPreviewFamilyChange={onPreviewChange} />
            </Suspense></AdvancedBoundary> : <>
              <QuickSettings {...preferences} weather={meta.weather} rain={meta.rain}
                page={page} onNavigate={navigate}
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
