"use client"

import { FieldType } from "@/types/form"
import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  Calendar,
  Clock,
  Link,
  ChevronDown,
  CheckSquare,
  CircleDot,
  Upload,
  Image,
  Star,
  Palette,
  SlidersHorizontal,
} from "lucide-react"

interface PaletteItem {
  type: FieldType
  label: string
  icon: React.ReactNode
  group: string
}

const PALETTE_ITEMS: PaletteItem[] = [
  // Text
  { type: "text",     label: "Text",        icon: <Type className="h-4 w-4" />,            group: "Basic" },
  { type: "textarea", label: "Long Text",   icon: <AlignLeft className="h-4 w-4" />,       group: "Basic" },
  { type: "email",    label: "Email",       icon: <Mail className="h-4 w-4" />,            group: "Basic" },
  { type: "phone",    label: "Phone",       icon: <Phone className="h-4 w-4" />,           group: "Basic" },
  { type: "number",   label: "Number",      icon: <Hash className="h-4 w-4" />,            group: "Basic" },
  { type: "url",      label: "URL",         icon: <Link className="h-4 w-4" />,            group: "Basic" },
  // Date & Time
  { type: "date",     label: "Date",        icon: <Calendar className="h-4 w-4" />,        group: "Date & Time" },
  { type: "time",     label: "Time",        icon: <Clock className="h-4 w-4" />,           group: "Date & Time" },
  // Choice
  { type: "select",   label: "Dropdown",    icon: <ChevronDown className="h-4 w-4" />,     group: "Choice" },
  { type: "radio",    label: "Radio",       icon: <CircleDot className="h-4 w-4" />,       group: "Choice" },
  { type: "checkbox", label: "Checkbox",    icon: <CheckSquare className="h-4 w-4" />,     group: "Choice" },
  // Media
  { type: "file",     label: "File Upload", icon: <Upload className="h-4 w-4" />,          group: "Media" },
  { type: "image",    label: "Image Upload",icon: <Image className="h-4 w-4" />,           group: "Media" },
  // Special
  { type: "rating",   label: "Rating",      icon: <Star className="h-4 w-4" />,            group: "Special" },
  { type: "range",    label: "Slider",      icon: <SlidersHorizontal className="h-4 w-4" />, group: "Special" },
  { type: "color",    label: "Color",       icon: <Palette className="h-4 w-4" />,         group: "Special" },
]

const GROUPS = ["Basic", "Date & Time", "Choice", "Media", "Special"]

interface Props {
  onAdd: (type: FieldType) => void
}

export default function FieldPalette({ onAdd }: Props) {
  return (
    <div className="space-y-4 py-2">
      <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">
        Fields
      </p>
      {GROUPS.map((group) => {
        const items = PALETTE_ITEMS.filter((i) => i.group === group)
        return (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1 mb-1">
              {group}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAdd(item.type)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}