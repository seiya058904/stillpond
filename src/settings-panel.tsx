import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, SlidersHorizontal, RotateCcw, Undo2, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "./hooks/use-mobile";
import { QuickSettings, type QuickSettingsProps } from "./quick-settings";
import { useI18n } from "./i18n";
import { settings } from "./settings/store";
import { useSettingsMeta } from "./settings/react";
import type { SectionId } from "./settings/definition";
import "./settings.css";

const ConfigEditor = lazy(() => import("./config-editor").then(module => ({ default: module.ConfigEditor })));
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
  const [advanced, setAdvanced] = useState(false);
  const [reset, setReset] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) { setReset(false); onPreviewChange(null); } }, [open, onPreviewChange]);
  const navigate = (next: boolean) => {
    setAdvanced(next); setReset(false); setQuery(""); onPreviewChange(null);
    scroll.current?.scrollTo({top:0});
  };
  const resetSection = (ids: readonly SectionId[]) => settings.resetSections(ids);
  return <MotionConfig reducedMotion="user"><Drawer open={open} onOpenChange={onOpenChange} modal={false}
    swipeDirection={mobile ? "down" : "right"} showSwipeHandle={mobile} disablePointerDismissal>
    <DrawerContent className="settings-drawer" onKeyDown={event => { if(event.key === "Escape") onOpenChange(false); }}>
      <DrawerHeader className="settings-drawer__header">
        <div className="settings-heading">
          {advanced && <button ref={back} className="icon-button" aria-label={t("product.back")} onClick={() => navigate(false)}><ArrowLeft aria-hidden="true" /></button>}
          <div><DrawerTitle>{t(advanced ? "advanced.title" : "settings.title")}</DrawerTitle>
            <DrawerDescription>{t(advanced ? "advanced.hint" : "product.settingsHint")}</DrawerDescription></div>
        </div>
        <button className="icon-button" aria-label={t("settings.close")} onClick={() => onOpenChange(false)}><X aria-hidden="true" /></button>
      </DrawerHeader>
      <div ref={scroll} className="settings-scroll" data-base-ui-swipe-ignore>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={advanced ? "advanced" : "simple"} initial={{opacity:0,x:reduced ? 0 : advanced ? 18 : -18}}
            animate={{opacity:1,x:0}} exit={{opacity:0,x:reduced ? 0 : advanced ? 12 : -12}}
            transition={reduced ? {duration:0} : {type:"spring",stiffness:430,damping:38,mass:.8}}
            onAnimationComplete={() => { if(advanced) back.current?.focus({preventScroll:true}); }}>
            {advanced ? <Suspense fallback={<p role="status" className="preference-note">{t("settings.loading")}</p>}>
              <ConfigEditor query={query} onQueryChange={setQuery} onResetSection={resetSection}
                selectedFamily={selectedFamily} previewFamily={preview} onFamilyChange={index => {setSelectedFamily(index); onPreviewChange(index);}}
                onPreviewFamilyChange={onPreviewChange} />
            </Suspense> : <>
              <QuickSettings {...preferences} weather={meta.weather} rain={meta.rain}
                onWeatherChange={id => settings.setWeather(id)} onRainChange={on => settings.setRain(on)} />
              <button className="advanced-link" onClick={() => navigate(true)}><SlidersHorizontal aria-hidden="true" />
                <span><strong>{t("advanced.title")}</strong><small>{t("product.advancedHint")}</small></span><ChevronRight aria-hidden="true" /></button>
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
