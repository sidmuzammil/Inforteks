import {
  Cable,
  Cpu,
  Gamepad2,
  Headphones,
  Keyboard,
  Laptop,
  Monitor,
  Printer,
  Router,
  Smartphone,
  HardDrive,
  Grid2X2,
} from "lucide-react";

/** Navigation symbols describe departments; they never stand in for product photos. */
export function DepartmentIcon({
  name,
  size = 28,
}: {
  name: string;
  size?: number;
}) {
  const key = name.toLowerCase();
  const Icon = /toner|ink|print|drum|cartridge/.test(key)
    ? Printer
    : /laptop|notebook/.test(key)
      ? Laptop
      : /monitor|display|desktop/.test(key)
        ? Monitor
        : /head|audio|speaker/.test(key)
          ? Headphones
          : /component|processor|motherboard|graphic|memory/.test(key)
            ? Cpu
            : /network|router|switch/.test(key)
              ? Router
              : /phone|tablet|mobile/.test(key)
                ? Smartphone
                : /storage|drive|ssd/.test(key)
                  ? HardDrive
                  : /gaming|console/.test(key)
                    ? Gamepad2
                    : /keyboard|mouse|peripheral/.test(key)
                      ? Keyboard
                      : /accessor|cable|adapter/.test(key)
                        ? Cable
                        : Grid2X2;
  return <Icon size={size} strokeWidth={1.4} aria-hidden="true" />;
}
