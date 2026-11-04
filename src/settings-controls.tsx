import { useState, type ComponentProps } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { useIsPresent } from "motion/react";

export function SettingsSelect({ id, value, options, onValueChange }: {
  id: string;
  value: string;
  options: {value: string; label: string}[];
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const present = useIsPresent();
  return <Select.Root items={options} value={value} onValueChange={next => { if (next !== null) onValueChange(next); }}
    open={open && present} onOpenChange={setOpen} modal={false}>
    <Select.Trigger id={id} className="quick-setting__select" data-base-ui-swipe-ignore>
      <Select.Value /><Select.Icon><ChevronDown aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Positioner className="settings-select-positioner" sideOffset={6} align="end" alignItemWithTrigger={false}>
        <Select.Popup className="settings-select-popup" hidden={!present}
          onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
          <Select.List className="settings-select-list"><Select.Group>
            {options.map(option => <Select.Item key={option.value} value={option.value} className="settings-select-option">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator><Check aria-hidden="true" /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Group></Select.List>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  </Select.Root>;
}

export function SettingsColorInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
