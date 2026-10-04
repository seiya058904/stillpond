import * as THREE from "three";
import { ChevronRight, Minus, Plus, RotateCcw, Search } from "lucide-react";
import { memo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createTranslator, useI18n } from "./i18n";
import { SettingsColorInput, SettingsSelect, SettingsSlider } from "./settings-controls";
import { useSetting } from "./settings/react";
import { settings } from "./settings/store";
import type { SectionId } from "./settings/definition";
import { ADVANCED_GROUPS, controlNode, familyColorControls, type AdvancedControl } from "./settings/advanced";
import { familyCounts, KOI_FAMILIES, MAX_KOI } from "./settings/composition";

interface ConfigEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onResetSection: (sectionIds: readonly SectionId[]) => void;
  selectedFamily: number;
  previewFamily: number | null;
  onFamilyChange: (index: number) => void;
  onPreviewFamilyChange: (index: number | null) => void;
}

const en = createTranslator("en"), zh = createTranslator("zh-CN");
const includes = (query: string, ...labels: string[]) => !query || labels.join(" ").toLowerCase().includes(query);
const controlMatches = (control: AdvancedControl, query: string) => includes(query, en.field(control.label), zh.field(control.label));
const compositionMatches = (query: string) => includes(query, en.t("composition.title"), zh.t("composition.title"),
  ...KOI_FAMILIES.flatMap(name => [en.family(name), zh.family(name)]));
const hex = (value: number) => `#${value.toString(16).padStart(6, "0")}`;
const formatNumber = (value: number) => Number(value.toFixed(2)).toLocaleString();

function ProductControl({control}: {control: AdvancedControl}) {
  const {t, field} = useI18n();
  const [value, setValue] = useSetting(control.path);
  const [leafCount] = useSetting<number>(["lotus","visibleLeafCount"]);
  const node = controlNode(control);
  const label = field(control.label);
  if (control.id === "lotus-flowers" && leafCount === 0) return <div className="config-property-row" data-setting={control.id}>
    <Label>{label}</Label><span className="advanced-note">{t("advanced.addLeaves")}</span>
  </div>;
  if (node.kind === "bool") return <div className="config-property-row config-property-row--switch" data-setting={control.id}>
    <Label htmlFor={control.id}>{label}</Label><Switch id={control.id} checked={value as boolean} onCheckedChange={next => setValue(next)} />
  </div>;
  if (node.kind === "color" || node.kind === "rgb") {
    const color = node.kind === "color" ? hex(value as number) : `#${new THREE.Color().setRGB(...value as [number,number,number]).getHexString()}`;
    return <div className="config-property-row" data-setting={control.id}>
      <Label htmlFor={control.id}>{label}</Label><div className="color-control"><span>{color}</span>
        <SettingsColorInput id={control.id} value={color} aria-label={label} onChange={next => setValue(node.kind === "color"
          ? Number.parseInt(next.slice(1),16) : new THREE.Color(next).toArray().map(channel => Number(channel.toFixed(4))))} />
      </div>
    </div>;
  }
  if (node.kind !== "num" && node.kind !== "range") return null;
  // Display older custom sizes outside the new comfortable range without
  // silently clamping a returning visitor's saved fish.
  const values = node.kind === "range" ? value as number[] : [value as number];
  const min = Math.min(control.min ?? node.min, ...values);
  const max = Math.max(control.max ?? node.max, ...values);
  const slider = (current: number, index?: number) => <SettingsSlider
    aria-label={index === undefined ? label : `${label} · ${t(index === 0 ? "advanced.minimum" : "advanced.maximum")}`}
    label={label} showLabel={false} min={min} max={max} step={node.step} value={current}
    onValueChange={next => {
      if (index === undefined) setValue(next);
      else { const range = [...values]; range[index] = index === 0 ? Math.min(next,range[1]) : Math.max(next,range[0]); setValue(range); }
    }} formatValue={control.percent ? next => `${Math.round(next*100)}%` : formatNumber} className="drawer-elastic-slider" />;
  return node.kind === "num" ? <div className="config-property-row" data-setting={control.id} data-base-ui-swipe-ignore>
    <Label>{label}</Label>{slider(value as number)}
  </div> : <div className="config-cluster" data-setting={control.id} data-base-ui-swipe-ignore>
    <div className="config-cluster__label">{label}</div>
    {values.map((current,index) => <div className="config-property-row" key={index}>
      <Label>{t(index === 0 ? "advanced.minimum" : "advanced.maximum")}</Label>{slider(current,index)}
    </div>)}
  </div>;
}

function FamilySwatch({family}: {family: number}) {
  const [base] = useSetting<number>(["koi-palettes",family,"base"]);
  const [accent] = useSetting<number>(["koi-palettes",family,"accent"]);
  const [marking] = useSetting<number>(["koi-palettes",family,"marking"]);
  return <svg className="family-swatch" viewBox="0 0 44 24" aria-hidden="true">
    <defs><clipPath id={`family-chip-${family}`}><ellipse cx="22" cy="12" rx="21" ry="9" /></clipPath></defs>
    <ellipse cx="22" cy="12" rx="21" ry="9" fill={hex(base)} />
    <g clipPath={`url(#family-chip-${family})`}>{settings.live["koi-patterns"][family].map((patch,index) =>
      <ellipse key={index} cx={patch.position*44} cy={12+patch.offset*6} rx={Math.max(2,patch.length*44)}
        ry={patch.width*10} fill={hex(patch.color === "accent" ? accent : marking)} />)}</g>
  </svg>;
}

function Composition({query}: {query: string}) {
  const {t,family} = useI18n();
  const [families] = useSetting<readonly number[]>(["koi","families"]);
  const counts = familyCounts(families);
  const all = includes(query,en.t("composition.title"),zh.t("composition.title"));
  return <section className="koi-composition" aria-label={t("composition.title")}>
    <div className="composition-heading"><h4>{t("composition.title")}</h4><output data-koi-total aria-live="polite">{t("composition.total",{count:families.length})}</output></div>
    <p className="advanced-note">{t("composition.hint")}</p>
    {KOI_FAMILIES.map((name,index) => (all || includes(query,en.family(name),zh.family(name))) &&
      <div className="composition-row" key={name} data-family={name}>
        <FamilySwatch family={index} /><span className="composition-family">{family(name)}</span>
        <div className="composition-stepper" data-base-ui-swipe-ignore>
          <button type="button" aria-label={t("composition.remove",{family:family(name)})} disabled={counts[index]===0}
            onClick={() => settings.setFamilyCount(index,counts[index]-1)}><Minus aria-hidden="true" /></button>
          <output aria-label={t("composition.count",{family:family(name)})}>{counts[index]}</output>
          <button type="button" aria-label={t("composition.add",{family:family(name)})} disabled={families.length>=MAX_KOI}
            onClick={() => settings.setFamilyCount(index,counts[index]+1)}><Plus aria-hidden="true" /></button>
        </div>
      </div>)}
    <p className="advanced-note">{t("composition.resizeHint")}</p>
  </section>;
}

function FamilyAppearance({query, selectedFamily, previewFamily, onFamilyChange, onPreviewFamilyChange}: Pick<ConfigEditorProps,
  "selectedFamily"|"previewFamily"|"onFamilyChange"|"onPreviewFamilyChange"> & {query: string}) {
  const {t,family} = useI18n();
  const controls = familyColorControls(selectedFamily,settings.live["koi-patterns"][selectedFamily]);
  const all = includes(query,en.t("appearance.family"),zh.t("appearance.family"),en.family(KOI_FAMILIES[selectedFamily]),zh.family(KOI_FAMILIES[selectedFamily]));
  if (!all && !controls.some(control => controlMatches(control,query))) return null;
  return <section className="family-appearance" aria-label={t("appearance.family")}>
    <h4>{t("appearance.family")}</h4>
    <div className="appearance-preview">
      <label htmlFor="preview-family">{t("quick.family")}</label>
      <SettingsSelect id="preview-family" value={String(selectedFamily)} onValueChange={next => onFamilyChange(Number(next))}
        options={KOI_FAMILIES.map((name,index) => ({value:String(index),label:family(name)}))} />
      <button type="button" className="family-preview-toggle" aria-pressed={previewFamily!==null}
        onClick={() => onPreviewFamilyChange(previewFamily===null ? selectedFamily : null)}>
        {t(previewFamily===null ? "quick.preview" : "quick.showAll",{family:family(KOI_FAMILIES[selectedFamily])})}
      </button>
    </div>
    <p className="advanced-note">{t(previewFamily===null ? "appearance.hint" : "appearance.previewHint")}</p>
    {controls.filter(control => all || controlMatches(control,query)).map(control => <ProductControl control={control} key={control.id} />)}
  </section>;
}

function AdvancedGroup({group,query,...props}: {group:(typeof ADVANCED_GROUPS)[number];query:string} & Omit<ConfigEditorProps,"query"|"onQueryChange">) {
  const {t} = useI18n();
  const [expanded,setExpanded] = useState(group.id === "koi");
  const all = includes(query,en.t(`section.${group.id}`),zh.t(`section.${group.id}`),en.t(`group.${group.id}`),zh.t(`group.${group.id}`));
  const controls = group.controls.filter(control => all || controlMatches(control,query));
  const showComposition = group.id === "koi" && (all || compositionMatches(query));
  const isOpen = expanded || Boolean(query);
  return <details className="config-advanced-group" open={isOpen} onToggle={event => {
    if (!query) setExpanded(event.currentTarget.open);
    if (event.currentTarget.open && group.id !== "koi") props.onPreviewFamilyChange(null);
  }}>
    <summary className="config-section"><span><strong>{t(`section.${group.id}`)}</strong><small>{t(`group.${group.id}`)}</small></span><ChevronRight aria-hidden="true" /></summary>
    {isOpen && <div className="config-advanced-group__body">
      <button type="button" className="settings-section-reset" onClick={() => props.onResetSection(group.sections)}><RotateCcw aria-hidden="true" />{t("action.resetGroup",{group:t(`section.${group.id}`)})}</button>
      {showComposition && <Composition query={all ? "" : query} />}
      {controls.map(control => <ProductControl control={control} key={control.id} />)}
      {group.id === "koi" && <FamilyAppearance {...props} query={all ? "" : query} />}
      {group.id === "medaka" && <p className="advanced-note">{t("advanced.medakaHint")}</p>}
      {group.id === "plants" && <p className="advanced-note">{t("advanced.plantsHint")}</p>}
    </div>}
  </details>;
}

export const ConfigEditor = memo(function ConfigEditor({query,onQueryChange,...props}: ConfigEditorProps) {
  const {t} = useI18n();
  const normalized = query.trim().toLowerCase();
  const colorControls = familyColorControls(props.selectedFamily,settings.live["koi-patterns"][props.selectedFamily]);
  const groups = ADVANCED_GROUPS.filter(group => includes(normalized,en.t(`section.${group.id}`),zh.t(`section.${group.id}`),en.t(`group.${group.id}`),zh.t(`group.${group.id}`)) ||
    group.controls.some(control => controlMatches(control,normalized)) || (group.id === "koi" && (compositionMatches(normalized) ||
      includes(normalized,en.t("appearance.family"),zh.t("appearance.family")) || colorControls.some(control => controlMatches(control,normalized)))));
  return <div className="advanced-settings">
    <div className="settings-search"><Search aria-hidden="true" /><Input value={query} onChange={event => onQueryChange(event.target.value)}
      placeholder={t("advanced.searchPlaceholder")} aria-label={t("advanced.search")} /></div>
    {groups.length===0 ? <p className="config-empty">{t("advanced.empty",{query})}</p> : <div className="config-sections" aria-label={t("advanced.categories")}>
      {groups.map(group => <AdvancedGroup key={group.id} group={group} query={normalized} {...props} />)}
    </div>}
  </div>;
});
