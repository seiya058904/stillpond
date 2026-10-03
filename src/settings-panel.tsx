import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, RotateCcw, Undo2, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
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

export default function SettingsPanel({open, onOpenChange, preview, onPreviewChange, ...preferences}: Props) {
  const {t} = useI18n();
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
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
  return <MotionConfig reducedMotion="user"><Drawer open={open} onOpenChange={onOpenChange} modal={false}
    swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} disablePointerDismissal>
    <DrawerContent className="settings-drawer" onKeyDown={event => { if(event.key === "Escape") onOpenChange(false); }}>
      <DrawerHeader className="settings-drawer__header">
        <div className="settings-heading">
          {page !== "root" && <button ref={back} className="icon-button" aria-label={t("product.back")} onClick={() => navigate("root")}><ArrowLeft aria-hidden="true" /></button>}
          <div><DrawerTitle>{t(page === "root" ? "settings.title" : preferenceTitles[page])}</DrawerTitle>
            <DrawerDescription>{t(advanced ? "advanced.hint" : "product.settingsHint")}</DrawerDescription></div>
        </div>
        <button className="icon-button" aria-label={t("settings.close")} onClick={() => onOpenChange(false)}><X aria-hidden="true" /></button>
      </DrawerHeader>
      <div ref={scroll} className="settings-scroll" data-base-ui-swipe-ignore>
        <AnimatePresence mode="wait" initial={false} custom={direction.current}>
          <motion.div key={page} custom={direction.current} initial="enter" animate="visible" exit="exit"
            variants={{enter:(d:number) => ({opacity:0,x:reduced ? 0 : d * 22}), visible:{opacity:1,x:0}, exit:(d:number) => ({opacity:0,x:reduced ? 0 : -d * 12})}}
            transition={reduced ? {duration:0} : {duration:0.16,ease:[0.22,1,0.36,1]}}
            onAnimationComplete={() => { if(page !== "root") back.current?.focus({preventScroll:true});
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
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="settings-drawer__footer">
        {reset ? <div className="settings-reset-confirm" role="group" aria-label={t("settings.resetConfirmLabel")}>
          <p>{t("settings.resetConfirm")}</p><div><button className="panel-button" onClick={() => setReset(false)}>{t("action.cancel")}</button>
          <button className="panel-button panel-button--danger" onClick={() => {settings.resetAll(); onPreviewChange(null); setReset(false);}}>{t("action.resetAll")}</button></div>
        </div> : <>
          <button className="icon-button" onClick={() => settings.undo()} disabled={!meta.canUndo} aria-label={t("action.undo")} title={t("action.undo")}><Undo2 aria-hidden="true" /></button>
          <button className="panel-button panel-button--quiet" onClick={() => setReset(true)}><RotateCcw aria-hidden="true" />{t("action.resetAll")}</button>
          <button className="panel-button panel-button--primary" onClick={() => onOpenChange(false)}>{t("action.done")}</button>
        </>}
      </footer>
    </DrawerContent>
  </Drawer></MotionConfig>;
}
