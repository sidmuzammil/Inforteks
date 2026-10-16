// Illustrative editorial starters, never a catalogue seed or merchant claims.
export const sampleProducts = [
  {
    id: "work-laptop",
    name: "SAMPLE · Everyday work laptop",
    category: "Laptops",
    description:
      "Draft concept for a portable work laptop. Replace every illustrative specification with verified supplier details before creating a real listing.",
    highlights: [
      "Illustrative 14-inch workspace",
      "Example portable configuration",
    ],
    specs: {
      display: "14 inch (illustrative)",
      ram: "16 GB (illustrative)",
      storage: "512 GB SSD (illustrative)",
    },
    image: "laptop",
  },
  {
    id: "desk-monitor",
    name: "SAMPLE · Creative desk monitor",
    category: "Monitors",
    description:
      "Draft concept for a desktop display. This is an editorial sample, with no verified price, warranty, stock or delivery commitment.",
    highlights: ["Illustrative 27-inch display", "Example desk upgrade"],
    specs: {
      display: "27 inch (illustrative)",
      resolution: "QHD (illustrative)",
    },
    image: "monitor",
  },
  {
    id: "daily-headset",
    name: "SAMPLE · Everyday audio headset",
    category: "Accessories",
    description:
      "Draft concept for everyday audio. Illustrative specifications only; this sample is not a product offered for sale.",
    highlights: ["Illustrative over-ear design", "Example everyday accessory"],
    specs: {
      format: "Over-ear (illustrative)",
      connection: "Wireless (illustrative)",
    },
    image: "headphones",
  },
] as const;
export type SampleProductId = (typeof sampleProducts)[number]["id"];
