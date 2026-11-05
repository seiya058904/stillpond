import * as THREE from "three";
import { ChevronRight, Droplets, Fish, Flower2, Palette, Search } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createTranslator, useI18n } from "./i18n";
import { TILE } from "./quick-settings";
import { SettingsColorInput, SettingsSelect } from "./settings-controls";
import { IconTile, RangeInput, Stepper } from "./settings-ui";
import { useSetting } from "./settings/react";
import { settings } from "./settings/store";
import type { SectionId } from "./settings/definition";
import type { AdvancedGroupId } from "./settings/navigation";
import { ADVANCED_GROUPS, controlNode, familyColorControls, type AdvancedControl } from "./settings/advanced";
import { familyCounts, KOI_FAMILIES, MAX_KOI } from "./settings/composition";

interface ConfigEditorProps {
  groupId: AdvancedGroupId | null;
  onOpenGroup: (id: AdvancedGroupId) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onResetSection: (sectionIds: readonly SectionId[]) => void;
  selectedFamily: number;
  previewFamily: number | null;
  onFamilyChange: (index: number) => void;
  onPreviewFamilyChange: (index: number | null) => void;
}

const GROUP_ICONS: Record<AdvancedGroupId, {color: string; icon: ReactNode}> = {
  koi: {color: TILE.red, icon: <Fish />},
  "large-fish": {color: TILE.indigo, icon: <Fish />},
  "medium-fish": {color: TILE.orange, icon: <Fish />},
  "small-fish": {color: TILE.teal, icon: <Fish />},
  plants: {color: TILE.pink, icon: <Flower2 />},
  water: {color: TILE.blue, icon: <Droplets />},
  appearance: {color: TILE.purple, icon: <Palette />},
};

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
  if (node.kind === "bool") return <div className="config-property-row" data-setting={control.id}>
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
  const format = (current: number) => control.percent ? `${Math.round(current*100)}%` : formatNumber(current);
  const slider = (current: number, name: string, index?: number) => <div className="config-slider" key={name}>
    <div className="config-slider__heading"><span>{name}</span><output>{format(current)}</output></div>
    <RangeInput ariaLabel={index === undefined ? label : `${label} · ${name}`} min={min} max={max} step={node.step} value={current} valueText={format(current)}
      onChange={next => {
        if (index === undefined) setValue(next);
        else { const range = [...values]; range[index] = index === 0 ? Math.min(next,range[1]) : Math.max(next,range[0]); setValue(range); }
      }} />
  </div>;
  return node.kind === "num" ? <div className="config-cell" data-setting={control.id} data-base-ui-swipe-ignore>{slider(value as number, label)}</div>
    : <div className="config-cell" data-setting={control.id} data-base-ui-swipe-ignore>
      <div className="config-cluster__label">{label}</div>
      {values.map((current,index) => slider(current, t(index === 0 ? "advanced.minimum" : "advanced.maximum"), index))}
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
  return <section className="preference-group" aria-label={t("composition.title")}>
    <h3 className="composition-heading"><span>{t("composition.title")}</span><output data-koi-total aria-live="polite">{t("composition.total",{count:families.length})}</output></h3>
    <div className="preference-card">
      {KOI_FAMILIES.map((name,index) => (all || includes(query,en.family(name),zh.family(name))) &&
        <div className="preference-row" key={name} data-family={name}>
          <FamilySwatch family={index} /><span className="preference-row__label">{family(name)}</span>
          <output className="preference-row__value" aria-label={t("composition.count",{family:family(name)})}>{counts[index]}</output>
          <Stepper value={counts[index]} min={0} max={families.length >= MAX_KOI ? counts[index] : MAX_KOI}
            onChange={next => settings.setFamilyCount(index,next)}
            decreaseLabel={t("composition.remove",{family:family(name)})} increaseLabel={t("composition.add",{family:family(name)})} />
        </div>)}
    </div>
    <p className="preference-note">{t("composition.hint")} {t("composition.resizeHint")}</p>
  </section>;
}

function FamilyAppearance({query, selectedFamily, previewFamily, onFamilyChange, onPreviewFamilyChange}: Pick<ConfigEditorProps,
  "selectedFamily"|"previewFamily"|"onFamilyChange"|"onPreviewFamilyChange"> & {query: string}) {
  const {t,family} = useI18n();
  const controls = familyColorControls(selectedFamily,settings.live["koi-patterns"][selectedFamily]);
  const all = includes(query,en.t("appearance.family"),zh.t("appearance.family"),en.family(KOI_FAMILIES[selectedFamily]),zh.family(KOI_FAMILIES[selectedFamily]));
  if (!all && !controls.some(control => controlMatches(control,query))) return null;
  return <section className="preference-group family-appearance" aria-label={t("appearance.family")}>
    <h3>{t("appearance.family")}</h3>
    <div className="preference-card">
      <div className="config-property-row">
        <label htmlFor="preview-family">{t("quick.family")}</label>
        <SettingsSelect id="preview-family" value={String(selectedFamily)} onValueChange={next => onFamilyChange(Number(next))}
          options={KOI_FAMILIES.map((name,index) => ({value:String(index),label:family(name)}))} />
      </div>
      {controls.filter(control => all || controlMatches(control,query)).map(control => <ProductControl control={control} key={control.id} />)}
      <button type="button" className="preference-row preference-row--button family-preview-toggle" aria-pressed={previewFamily!==null}
        onClick={() => onPreviewFamilyChange(previewFamily===null ? selectedFamily : null)}>
        {t(previewFamily===null ? "quick.preview" : "quick.showAll",{family:family(KOI_FAMILIES[selectedFamily])})}
      </button>
    </div>
    <p className="preference-note">{t(previewFamily===null ? "appearance.hint" : "appearance.previewHint")}</p>
  </section>;
}

function GroupBody({group,query,resettable,...props}: {group:(typeof ADVANCED_GROUPS)[number];query:string;resettable:boolean} & Omit<ConfigEditorProps,"query"|"onQueryChange"|"groupId"|"onOpenGroup">) {
  const {t} = useI18n();
  const all = includes(query,en.t(`section.${group.id}`),zh.t(`section.${group.id}`),en.t(`group.${group.id}`),zh.t(`group.${group.id}`));
  const controls = group.controls.filter(control => all || controlMatches(control,query));
  const showComposition = group.id === "koi" && (all || compositionMatches(query));
  const note = group.id === "small-fish" ? t("advanced.medakaHint") : group.id === "plants" ? t("advanced.plantsHint") : null;
  return <>
    {showComposition && <Composition query={all ? "" : query} />}
    {controls.length > 0 && <section className="preference-group">
      <div className="preference-card">{controls.map(control => <ProductControl control={control} key={control.id} />)}</div>
      {note && <p className="preference-note">{note}</p>}
    </section>}
    {group.id === "koi" && <FamilyAppearance {...props} query={all ? "" : query} />}
    {resettable && <section className="preference-group"><div className="preference-card">
      <button type="button" className="preference-row preference-row--button preference-row--danger settings-section-reset" onClick={() => props.onResetSection(group.sections)}>{t("action.resetGroup",{group:t(`section.${group.id}`)})}</button>
    </div></section>}
  </>;
}

export const ConfigEditor = memo(function ConfigEditor({groupId,onOpenGroup,query,onQueryChange,...props}: ConfigEditorProps) {
  const {t} = useI18n();
  if (groupId) {
    const group = ADVANCED_GROUPS.find(entry => entry.id === groupId);
    return group ? <div className="preferences"><GroupBody group={group} query="" resettable {...props} /></div> : null;
  }
  const normalized = query.trim().toLowerCase();
  const colorControls = familyColorControls(props.selectedFamily,settings.live["koi-patterns"][props.selectedFamily]);
  const groups = ADVANCED_GROUPS.filter(group => includes(normalized,en.t(`section.${group.id}`),zh.t(`section.${group.id}`),en.t(`group.${group.id}`),zh.t(`group.${group.id}`)) ||
    group.controls.some(control => controlMatches(control,normalized)) || (group.id === "koi" && (compositionMatches(normalized) ||
      includes(normalized,en.t("appearance.family"),zh.t("appearance.family")) || colorControls.some(control => controlMatches(control,normalized)))));
  return <div className="preferences advanced-settings">
    <div className="settings-search"><Search aria-hidden="true" /><Input value={query} onChange={event => onQueryChange(event.target.value)}
      placeholder={t("advanced.searchPlaceholder")} aria-label={t("advanced.search")} /></div>
    {groups.length===0 ? <p className="config-empty">{t("advanced.empty",{query})}</p>
      : normalized ? groups.map(group => <div className="search-result" key={group.id}>
          <h3 className="search-result__title">{t(`section.${group.id}`)}</h3>
          <GroupBody group={group} query={normalized} resettable={false} {...props} />
        </div>)
      : <section className="preference-group" aria-label={t("advanced.categories")}><div className="preference-card">
          {groups.map(group => <button type="button" className="preference-row preference-row--button config-group-row" data-group={group.id} key={group.id} onClick={() => onOpenGroup(group.id)}>
            <IconTile color={GROUP_ICONS[group.id].color}>{GROUP_ICONS[group.id].icon}</IconTile>
            <span className="preference-row__label config-group-row__text"><strong>{t(`section.${group.id}`)}</strong><small>{t(`group.${group.id}`)}</small></span>
            <ChevronRight className="preference-row__chevron" aria-hidden="true" />
          </button>)}
        </div></section>}
  </div>;
});
