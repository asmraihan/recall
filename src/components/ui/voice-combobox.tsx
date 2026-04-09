"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface Voice {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  FriendlyName: string
}

interface VoiceComboboxProps {
  voices: Voice[]
  value: string
  onSelect: (shortName: string) => void
  isLoading?: boolean
}

export function VoiceCombobox({ voices, value, onSelect, isLoading }: VoiceComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedVoice = Array.isArray(voices) ? voices.find((voice) => voice.ShortName === value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={isLoading}
        >
          {value && selectedVoice
            ? <div className="justify-center text-start text-xs"> <p>{selectedVoice.FriendlyName}</p>
              <p> - {selectedVoice.Gender}</p></div>
            : "Select a voice..."}
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search voices..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading voices..." : "No voice found."}
            </CommandEmpty>
            <CommandGroup>
              {Array.isArray(voices) && voices.map((voice) => (
                <CommandItem
                  key={voice.ShortName}
                  value={voice.FriendlyName}
                  onSelect={(currentValue) => {
                    const selectedVoice = voices.find(v => v.FriendlyName === currentValue)
                    if (selectedVoice) {
                      onSelect(selectedVoice.ShortName === value ? "" : selectedVoice.ShortName)
                      setOpen(false)
                    }
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === voice.ShortName ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{voice.FriendlyName}</span>
                    <span className="text-xs text-muted-foreground">
                      {voice.Gender} • {voice.Locale}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
