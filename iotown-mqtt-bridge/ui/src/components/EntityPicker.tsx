import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import type { NamedItem } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (id: string) => void;
  items: NamedItem[];
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
}

// Pick a ChirpStack application or gateway by name from the list the ChirpStack API returns
export function EntityPicker({ value, onChange, items, placeholder, disabled, invalid }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("w-full h-auto min-h-9 justify-between font-normal py-1.5", !value && "text-muted-foreground")}
        >
          {value ? (
            <span className="flex flex-col items-start min-w-0 text-left">
              <span className="truncate max-w-full">{selected ? selected.name : t.mapping.unknownName}</span>
              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-full">{value}</span>
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-(--radix-popover-trigger-width) w-96 max-w-[90vw] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder={t.mapping.search} />
          <CommandList>
            <CommandEmpty>{t.mapping.noMatch}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem key={item.id} value={`${item.name} ${item.id} ${item.tenant}`} onSelect={() => choose(item.id)}>
                  <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">
                      {item.name}
                      <span className="ml-2 text-xs text-muted-foreground">{item.tenant}</span>
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{item.id}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
