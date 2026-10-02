import "dotenv/config";
import { db } from "../src/lib/db";
import { slugify } from "../src/lib/utils";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seeding is forbidden in production.");
  const definitions = [
    {
      name: "Laptops",
      slug: "laptops",
      icon: "laptop",
      art: "laptop",
      brands: ["ASUS", "Lenovo", "Dell", "HP", "MSI"],
      names: [
        "ROG Zephyrus G16 Gaming Laptop",
        "ThinkPad X1 Carbon Laptop",
        "XPS 14 Everyday Performance",
        "Pavilion Plus 14 Laptop",
        "Katana 15 Gaming Laptop",
      ],
      prices: [649900, 579900, 529900, 319900, 449900],
    },
    {
      name: "Desktops & Workstations",
      slug: "desktops",
      icon: "desktop",
      art: "desktop",
      brands: ["Lenovo", "Dell", "HP", "ASUS", "MSI"],
      names: [
        "ThinkStation Creative Workstation",
        "OptiPlex Compact Desktop",
        "OMEN Gaming Desktop",
        "ExpertCenter Business PC",
        "MAG Infinite Gaming Desktop",
      ],
      prices: [729900, 329900, 629900, 259900, 589900],
    },
    {
      name: "PC Components",
      slug: "components",
      icon: "processor",
      art: "processor",
      brands: ["Intel", "ASUS", "MSI", "Intel", "ASUS"],
      names: [
        "Core Desktop Processor",
        "Prime Series Motherboard",
        "Pro Series Motherboard",
        "Core Performance Processor",
        "TUF Series Motherboard",
      ],
      prices: [119900, 84900, 64900, 159900, 109900],
    },
    {
      name: "Graphics Cards",
      slug: "graphics-cards",
      icon: "graphics",
      art: "graphics",
      brands: ["ASUS", "MSI", "ASUS", "MSI", "ASUS"],
      names: [
        "GeForce Gaming Graphics Card",
        "Ventus Performance Graphics Card",
        "Dual Series Graphics Card",
        "Gaming Trio Graphics Card",
        "TUF Gaming Graphics Card",
      ],
      prices: [289900, 229900, 179900, 359900, 329900],
    },
    {
      name: "Memory & Storage",
      slug: "storage",
      icon: "storage",
      art: "storage",
      brands: ["Samsung", "Corsair", "Samsung", "Corsair", "Samsung"],
      names: [
        "990 PRO NVMe SSD · 1TB",
        "Vengeance Desktop Memory · 32GB",
        "Portable Solid State Drive · 2TB",
        "Vengeance Desktop Memory · 16GB",
        "EVO Plus NVMe SSD · 2TB",
      ],
      prices: [42900, 38900, 64900, 21900, 59900],
    },
    {
      name: "Cases, Power & Cooling",
      slug: "cases-cooling",
      icon: "desktop",
      art: "desktop",
      brands: ["Corsair", "ASUS", "Corsair", "MSI", "Corsair"],
      names: [
        "Airflow Mid-Tower Case",
        "Prime Compact PC Case",
        "Modular Desktop Power Supply",
        "Quiet Performance PC Case",
        "Airflow Workspace Case",
      ],
      prices: [39900, 32900, 54900, 35900, 48900],
    },
    {
      name: "Monitors",
      slug: "monitors",
      icon: "monitor",
      art: "monitor",
      brands: ["Samsung", "Dell", "ASUS", "MSI", "HP"],
      names: [
        "Odyssey 27-inch Gaming Monitor",
        "UltraSharp 27-inch Work Monitor",
        "ProArt Creator Display",
        "Modern 27-inch Desktop Monitor",
        "Series 7 27-inch Monitor",
      ],
      prices: [139900, 189900, 169900, 84900, 119900],
    },
    {
      name: "Networking",
      slug: "networking",
      icon: "network",
      art: "network",
      brands: ["TP-Link", "ASUS", "TP-Link", "TP-Link", "ASUS"],
      names: [
        "Archer Dual-Band Wi-Fi Router",
        "ZenWiFi Home Mesh Router",
        "Deco Whole-Home Wi-Fi System",
        "Business Gigabit Network Switch",
        "Performance Wi-Fi Router",
      ],
      prices: [29900, 64900, 49900, 18900, 54900],
    },
    {
      name: "Printers & Office",
      slug: "printers",
      icon: "printer",
      art: "printer",
      brands: ["HP", "HP", "HP", "HP", "HP"],
      names: [
        "LaserJet Office Printer",
        "Smart Tank All-in-One Printer",
        "DeskJet Home Printer",
        "OfficeJet Business Printer",
        "LaserJet Compact Printer",
      ],
      prices: [79900, 59900, 24900, 89900, 44900],
    },
    {
      name: "Peripherals & Accessories",
      slug: "peripherals",
      icon: "keyboard",
      art: "keyboard",
      brands: ["Logitech", "Corsair", "Logitech", "ASUS", "Logitech"],
      names: [
        "MX Keys Wireless Keyboard",
        "K Series Mechanical Keyboard",
        "Studio Wireless Headphones",
        "ROG Gaming Headset",
        "Signature Desktop Keyboard",
      ],
      prices: [44900, 39900, 34900, 59900, 19900],
    },
  ];
  const brands = [...new Set(definitions.flatMap((d) => d.brands))];
  for (const name of brands)
    await db.brand.upsert({
      where: { slug: slugify(name) },
      create: { name, slug: slugify(name) },
      update: {},
    });
  for (const [i, d] of definitions.entries()) {
    const category = await db.category.upsert({
      where: { slug: d.slug },
      create: { name: d.name, slug: d.slug, icon: d.icon, position: i },
      update: {},
    });
    if (d.slug === "laptops")
      for (const [key, label] of [
        ["ram", "Memory (GB)"],
        ["storage", "Storage (GB)"],
        ["processor", "Processor"],
        ["display", "Display"],
        ["keyboard", "Keyboard layout"],
      ])
        await db.attribute.upsert({
          where: { categoryId_key: { categoryId: category.id, key } },
          create: {
            categoryId: category.id,
            key,
            label,
            unit: ["ram", "storage"].includes(key) ? "GB" : null,
            type: ["ram", "storage"].includes(key) ? "number" : "text",
            required: ["ram", "storage"].includes(key),
          },
          update: {},
        });
    for (let j = 0; j < 5; j++) {
      const name = d.names[j];
      const slug = slugify(name);
      if (await db.product.findUnique({ where: { slug } })) continue;
      const brand = await db.brand.findUniqueOrThrow({
        where: { slug: slugify(d.brands[j]) },
      });
      const code = `DEMO-${d.slug.toUpperCase().slice(0, 5)}-${String(j + 1).padStart(3, "0")}`;
      const specs =
        d.slug === "laptops"
          ? {
              ram: 16,
              storage: 512,
              processor: "Illustrative configuration",
              display: "16-inch",
              keyboard: "English",
            }
          : d.slug === "monitors"
            ? { display: "27-inch", resolution: "Illustrative configuration" }
            : { type: d.name };
      const p = await db.product.create({
        data: {
          name,
          slug,
          brandId: brand.id,
          categoryId: category.id,
          status: "PUBLISHED",
          featured: j < 2,
          demo: true,
          model: `Development model ${i + 1}.${j + 1}`,
          description: `A considered addition to your ${d.slug === "laptops" ? "everyday setup" : "workspace"}. This is an illustrative development listing for testing the Inforteks catalogue. Product identity, specifications, prices and availability must be verified by the merchant before launch. The original illustration is representative, not a manufacturer photograph.`,
          highlights:
            d.slug === "laptops"
              ? [
                  "16 GB memory · 512 GB storage",
                  "English keyboard layout",
                  "Illustrative development configuration",
                ]
              : [
                  "Designed for your everyday setup",
                  "Illustrative development configuration",
                ],
          specs: { dataset: "Development example" },
          skus: {
            create: {
              code,
              price: d.prices[j],
              compareAt:
                j < 2 ? Math.round((d.prices[j] * 1.14) / 100) * 100 : null,
              onHand: j === 4 ? 0 : j === 3 ? 2 : 12,
              specs,
            },
          },
          media: {
            create: {
              key: `illustrations/${d.art === "keyboard" && (j === 2 || j === 3) ? "headphones" : d.art}.svg?${code}`,
              alt: `Illustration of ${name}`,
              public: true,
            },
          },
        },
      });
      // SVG assets have a query suffix to keep media object keys unique.
      if (d.slug === "laptops" && j < 2)
        await db.sku.create({
          data: {
            productId: p.id,
            code: code + "-32",
            options: { ram: 32, storage: 1024 },
            specs: { ...specs, ram: 32, storage: 1024 },
            price: d.prices[j] + 65000,
            onHand: 5,
          },
        });
    }
  }
  const collection = await db.collection.upsert({
    where: { slug: "work-smarter" },
    create: { name: "Work smarter", slug: "work-smarter" },
    update: {},
  });
  for (const p of await db.product.findMany({
    where: { featured: true },
    take: 10,
  }))
    await db.collectionProduct.upsert({
      where: {
        collectionId_productId: {
          collectionId: collection.id,
          productId: p.id,
        },
      },
      create: { collectionId: collection.id, productId: p.id },
      update: {},
    });
  if (!(await db.shippingZone.count()))
    await db.shippingZone.create({
      data: {
        name: "Development standard delivery",
        emirates: [
          "Dubai",
          "Abu Dhabi",
          "Sharjah",
          "Ajman",
          "Fujairah",
          "Ras Al Khaimah",
          "Umm Al Quwain",
        ],
        rate: 2500,
        freeAbove: 50000,
        estimate: "Delivery timing will be confirmed by the store",
      },
    });
  await db.setting.upsert({
    where: { key: "tax" },
    create: {
      key: "tax",
      value: { registered: false, bps: 0, inclusive: false },
    },
    update: {},
  });
  await db.setting.upsert({
    where: { key: "store" },
    create: {
      key: "store",
      value: {
        name: "Inforteks",
        tagline: "Technology. Thoughtfully selected.",
        country: "United Arab Emirates",
        currency: "AED",
        demo: true,
      },
    },
    update: {},
  });
  await db.coupon.upsert({
    where: { code: "DEMO10" },
    create: {
      code: "DEMO10",
      percent: 10,
      minimum: 10000,
      maxUses: 100,
      endsAt: new Date("2030-01-01"),
    },
    update: {},
  });
  if (!(await db.homeSection.count()))
    await db.homeSection.createMany({
      data: [
        {
          title: "A new level of possibility.",
          subtitle:
            "Find the technology that moves you forward. Explore laptops, components and essentials for every kind of ambition.",
          kind: "hero",
          href: "/category/laptops",
          position: 0,
        },
        {
          title: "The right tech. For your next big thing.",
          subtitle: "Explore our departments",
          kind: "categories",
          href: "/categories",
          position: 1,
        },
        {
          title: "Worth a closer look",
          subtitle: "Selected for your next upgrade",
          kind: "featured",
          href: "/offers",
          position: 2,
        },
        {
          title: "Fresh arrivals. New possibilities.",
          subtitle: "Explore the latest additions to our catalogue",
          kind: "new",
          href: "/new-arrivals",
          position: 3,
        },
      ],
    });
  const pages = {
    about: [
      "Technology, with purpose.",
      "Inforteks is being built around a simple idea: choosing the right technology should feel straightforward. Explore IT essentials for work, play and everything in between. This development store uses illustrative catalogue data; company details and the live catalogue will be supplied before launch.",
    ],
    faq: [
      "Frequently asked questions",
      "Is this store live?\nThis is a development store. Products and prices are illustrative.\n\nHow can I check an order?\nSign in to your account or use the secure access link issued at checkout. An order number alone does not grant access.\n\nCan I compare products?\nYes. Add up to four products from the same department to compare their listed specifications.",
    ],
    "shipping-delivery": [
      "Shipping & delivery",
      "Delivery options are calculated from your emirate and cart. The merchant must confirm operational zones and delivery timelines before launch. Any checkout estimate is saved with the order.",
    ],
    "returns-refunds": [
      "Returns & refunds",
      "Customers can request a return for fulfilled items from their account. Return eligibility and final policy terms require merchant approval before launch. A return request does not mean a refund has been issued.",
    ],
    warranty: [
      "Warranty information",
      "Warranty information is shown only when supplied for the selected product. No warranty provider or duration is assumed. Contact the store with your product SKU for clarification.",
    ],
    "payment-methods": [
      "Payment methods",
      "Payment options are displayed at checkout only when enabled. The development payment simulator does not transfer money. Live payment processing has not been connected.",
    ],
    "privacy-policy": [
      "Privacy policy — pending approval",
      "This store's legal identity, privacy contact, data retention schedule and approved privacy policy must be supplied before production launch. This is a development notice, not a final legal policy.",
    ],
    "terms-conditions": [
      "Terms & conditions — pending approval",
      "The merchant must supply approved terms, legal identity, sales conditions and applicable commercial policies before accepting live orders. This page is an explicitly marked draft notice.",
    ],
  };
  for (const [slug, [title, body]] of Object.entries(pages))
    await db.contentPage.upsert({
      where: { slug },
      create: { slug, title, body, published: true },
      update: {},
    });
  console.log(
    `Development seed ready: ${await db.product.count()} products; no staff credentials or genuine sales created.`,
  );
}
main().finally(() => db.$disconnect());
