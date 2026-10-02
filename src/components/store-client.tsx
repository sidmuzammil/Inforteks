"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  useMemo,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  ShoppingCart,
  Heart,
  ChartNoAxesColumnIncreasing,
  Plus,
  Minus,
  Check,
  ArrowRight,
  X,
  Menu,
  ChevronDown,
} from "lucide-react";
import type { PublicProduct } from "@/domains/catalogue";
import { money } from "@/lib/utils";

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(
    path.startsWith("/api/") ? path : `/api/v1/${path}`,
    {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers:
        body instanceof FormData
          ? undefined
          : { "Content-Type": "application/json" },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ??
        result.message ??
        "Unable to complete this request.",
    );
  return (result.data ?? result) as T;
}
type Selection = { product: PublicProduct; skuId: string };
type ShopState = {
  count: number;
  wishlist: Selection[];
  compare: Selection[];
  refresh: () => Promise<void>;
  select: (
    kind: "wishlist" | "compare",
    p: PublicProduct,
    skuId: string,
  ) => void;
  message: (text: string) => void;
};
const Shop = createContext<ShopState | null>(null);
export const useShop = () => useContext(Shop)!;
function subscribeSelection(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("ift-selection", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("ift-selection", callback);
  };
}
function useSelectionStore(key: string) {
  const snapshot = useSyncExternalStore(
    subscribeSelection,
    () => localStorage.getItem(key) ?? "[]",
    () => "[]",
  );
  const value = useMemo<Selection[]>(() => {
    try {
      const parsed = JSON.parse(snapshot);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [snapshot]);
  const set = (next: Selection[]) => {
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("ift-selection"));
  };
  return [value, set] as const;
}
export function ShopProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  const wishlistKey = userId ? `ift-wishlist:${userId}` : "ift-wishlist";
  const [count, setCount] = useState(0);
  const [wishlist, setWishlist] = useSelectionStore(wishlistKey);
  const [compare, setCompare] = useSelectionStore("ift-compare");
  const [toast, setToast] = useState("");
  async function refresh() {
    try {
      const c = await api<{ items: { quantity: number }[] }>(
        "storefront/carts",
      );
      setCount(c.items.reduce((a, l) => a + l.quantity, 0));
    } catch {}
  }
  useEffect(() => {
    void api<{ items: { quantity: number }[] }>("storefront/carts")
      .then((c) => setCount(c.items.reduce((a, l) => a + l.quantity, 0)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const initial = localStorage.getItem(wishlistKey);
    void (async () => {
      try {
        const items = await api<Selection[]>("account/wishlist");
        if (cancelled || localStorage.getItem(wishlistKey) !== initial) return;
        localStorage.setItem(wishlistKey, JSON.stringify(items));
        window.dispatchEvent(new Event("ift-selection"));
      } catch {
        /* Keep the current selection when the network is unavailable. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, wishlistKey]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  function select(
    kind: "wishlist" | "compare",
    product: PublicProduct,
    skuId: string,
  ) {
    const items = kind === "wishlist" ? wishlist : compare;
    const exists = items.some((i) => i.skuId === skuId);
    if (!exists && kind === "compare" && items.length >= 4) {
      setToast("Compare up to four products at a time.");
      return;
    }
    if (
      !exists &&
      kind === "compare" &&
      items[0] &&
      items[0].product.category.id !== product.category.id
    ) {
      setToast("Choose products from the same department to compare.");
      return;
    }
    const next = exists
      ? items.filter((i) => i.skuId !== skuId)
      : [...items, { product, skuId }];
    (kind === "wishlist" ? setWishlist : setCompare)(next);
    setToast(
      exists
        ? "Removed from your selection."
        : kind === "compare"
          ? "Added to comparison."
          : "Saved to your wishlist.",
    );
    if (kind === "wishlist" && wishlistKey !== "ift-wishlist")
      void api("account/wishlist", { skuId }, exists ? "DELETE" : "POST").catch(
        () => {
          setWishlist(items);
          setToast("Your wishlist could not be saved. Please try again.");
        },
      );
  }
  return (
    <Shop.Provider
      value={{ count, wishlist, compare, refresh, select, message: setToast }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Shop.Provider>
  );
}
export function HeaderActions() {
  const shop = useShop();
  return (
    <div className="header-actions">
      <Link href="/account" className="account-shortcut">
        <span className="avatar-mini">i</span>
        <span>
          <small>Welcome to Inforteks</small>
          <b>Sign in / Account</b>
        </span>
      </Link>
      <Link
        href="/wishlist"
        aria-label={`Wishlist, ${shop.wishlist.length} items`}
      >
        <Heart size={22} />
        <span className="action-label">Wishlist</span>
      </Link>
      <Link
        href="/compare"
        aria-label={`Compare, ${shop.compare.length} items`}
      >
        <ChartNoAxesColumnIncreasing size={22} />
        <span className="action-label">Compare</span>
      </Link>
      <Link
        href="/cart"
        className="cart-shortcut"
        aria-label={`Cart, ${shop.count} items`}
      >
        <ShoppingCart size={23} />
        <span className="count">{shop.count}</span>
        <span className="action-label">Cart</span>
      </Link>
    </div>
  );
}
export function DepartmentMenu({
  categories,
}: {
  categories: { name: string; slug: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="department">
      <button
        className="department-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="department-menu"
      >
        <Menu size={18} />
        All departments
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          id="department-menu"
          className="mega-menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              onClick={() => setOpen(false)}
            >
              {c.name}
              <ArrowRight size={14} />
            </Link>
          ))}
          <Link href="/categories" onClick={() => setOpen(false)}>
            Browse all departments
          </Link>
        </div>
      )}
    </div>
  );
}
export function SearchBox() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/storefront/search?q=${encodeURIComponent(q)}&limit=5`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((r) => setItems(r.data?.products ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  return (
    <form
      action="/search"
      className="search-box"
      onSubmit={(e) => {
        if (active >= 0 && items[active]) {
          e.preventDefault();
          router.push(`/product/${items[active].slug}`);
        }
        setOpen(false);
      }}
    >
      <Search size={20} className="search-icon" />
      <input
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.length < 2) setItems([]);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search products, brands and more…"
        aria-label="Search products"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(Math.min(active + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(active - 1, -1));
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button aria-label="Submit search">
        <Search size={20} />
      </button>
      {open && items.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {items.map((p, i) => (
            <li
              key={p.id}
              role="option"
              id={`suggestion-${i}`}
              aria-selected={active === i}
            >
              <Link href={`/product/${p.slug}`} onClick={() => setOpen(false)}>
                <img
                  src={p.media[0]?.url ?? "/illustrations/laptop.svg"}
                  alt=""
                />
                <span>
                  {p.name}
                  <small>
                    {p.skus[0] ? money(p.skus[0].price) : "Unavailable"}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
export function CardActions({
  product,
  skuId,
}: {
  product: PublicProduct;
  skuId?: string;
}) {
  const shop = useShop();
  const sku = product.skus.find((s) => s.id === skuId) ?? product.skus[0];
  const [busy, setBusy] = useState(false);
  if (!sku) return null;
  return (
    <div className="card-actions">
      <button
        className="add-button"
        disabled={busy || sku.available === 0}
        aria-label={`Add ${product.name} to cart`}
        onClick={async () => {
          setBusy(true);
          try {
            await api("storefront/carts", { skuId: sku.id, quantity: 1 });
            await shop.refresh();
            shop.message("Added to your cart.");
          } catch (e) {
            shop.message((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {sku.available > 0 ? (
          <>
            <Plus size={16} />
            {busy ? "Adding…" : "Add to cart"}
          </>
        ) : (
          "Out of stock"
        )}
      </button>
      <button
        className="icon-button"
        aria-label={`Compare ${product.name}`}
        aria-pressed={shop.compare.some((i) => i.skuId === sku.id)}
        onClick={() => shop.select("compare", product, sku.id)}
      >
        <ChartNoAxesColumnIncreasing size={18} />
      </button>
    </div>
  );
}
export function WishlistButton({
  product,
  skuId,
}: {
  product: PublicProduct;
  skuId?: string;
}) {
  const shop = useShop();
  const sku = skuId ?? product.skus[0]?.id;
  const selected = shop.wishlist.some((i) => i.skuId === sku);
  return (
    <button
      className={`wishlist-button ${selected ? "selected" : ""}`}
      aria-label={`Save ${product.name} to wishlist`}
      aria-pressed={selected}
      onClick={() => {
        if (sku) shop.select("wishlist", product, sku);
      }}
    >
      <Heart size={19} fill={selected ? "currentColor" : "none"} />
    </button>
  );
}
export function ProductPurchase({
  product,
  initialSku,
}: {
  product: PublicProduct;
  initialSku?: string;
}) {
  const router = useRouter();
  const shop = useShop();
  const [selected, setSelected] = useState(initialSku ?? product.skus[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const sku = product.skus.find((s) => s.id === selected) ?? product.skus[0];
  if (!sku)
    return (
      <div className="notice">This product is not available to purchase.</div>
    );
  const specs = {
    ...(product.specs as Record<string, unknown>),
    ...(sku.specs as Record<string, unknown>),
  };
  return (
    <>
      <div className="product-meta">
        <span>{product.brand.name}</span>
        <span>SKU: {sku.code}</span>
        <span>{sku.condition}</span>
      </div>
      <div className="detail-price">
        {money(sku.price)}{" "}
        {sku.compareAt && sku.compareAt > sku.price && (
          <del>{money(sku.compareAt)}</del>
        )}
      </div>
      <p className={sku.available ? "stock" : "muted"}>
        {sku.available
          ? `${sku.available > 5 ? "In stock" : `Only ${sku.available} available`} · Ready to order`
          : "Currently out of stock"}
      </p>
      {product.skus.length > 1 && (
        <fieldset className="variants">
          <legend>Choose your configuration</legend>
          {product.skus.map((s) => (
            <button
              key={s.id}
              className={s.id === sku.id ? "active" : ""}
              onClick={() => {
                setSelected(s.id);
                setQuantity(1);
                router.replace(`/product/${product.slug}?sku=${s.id}`, {
                  scroll: false,
                });
              }}
              aria-pressed={s.id === sku.id}
            >
              {Object.entries(s.options as object).length
                ? Object.entries(s.options as object)
                    .map(([k, v]) => `${String(v)} ${k}`)
                    .join(" / ")
                : "Standard configuration"}
            </button>
          ))}
        </fieldset>
      )}
      <ul className="highlights">
        {product.highlights.map((h) => (
          <li key={h}>
            <Check size={15} />
            {h}
          </li>
        ))}
      </ul>
      <div className="purchase-row">
        <div className="quantity">
          <button
            aria-label="Decrease quantity"
            disabled={quantity <= 1}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={14} />
          </button>
          <span>{quantity}</span>
          <button
            aria-label="Increase quantity"
            disabled={quantity >= sku.available || quantity >= 99}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={14} />
          </button>
        </div>
        <button
          className="button primary grow"
          disabled={busy || sku.available === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await api("storefront/carts", { skuId: sku.id, quantity });
              await shop.refresh();
              shop.message("Added to your cart.");
            } catch (e) {
              shop.message((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShoppingCart size={18} />
          {busy ? "Adding…" : sku.available ? "Add to cart" : "Out of stock"}
        </button>
      </div>
      <div className="detail-selection">
        <button onClick={() => shop.select("wishlist", product, sku.id)}>
          <Heart size={17} />
          Save to wishlist
        </button>
        <button onClick={() => shop.select("compare", product, sku.id)}>
          <ChartNoAxesColumnIncreasing size={17} />
          Compare product
        </button>
      </div>
      <div className="spec-preview">
        {Object.entries(specs)
          .filter(([k]) => k !== "dataset")
          .map(([key, value]) => (
            <div key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <b>{String(value)}</b>
            </div>
          ))}
        {sku.warranty && (
          <div>
            <span>Warranty</span>
            <b>{sku.warranty}</b>
          </div>
        )}
      </div>
    </>
  );
}
export function Gallery({ product }: { product: PublicProduct }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const current = product.media[index];
  return (
    <div className="gallery">
      <button
        className="gallery-main"
        aria-label="Enlarge product image"
        onClick={() => {
          setZoom(true);
          ref.current?.showModal();
        }}
      >
        <img
          src={current?.url ?? "/illustrations/laptop.svg"}
          alt={current?.alt ?? product.name}
          fetchPriority="high"
        />
        <span>
          Click to enlarge <Plus size={13} />
        </span>
      </button>
      <div className="thumbnails">
        {product.media.map((m, i) => (
          <button
            key={m.id}
            className={i === index ? "active" : ""}
            aria-label={`View image ${i + 1}`}
            onClick={() => setIndex(i)}
          >
            <img src={m.url} alt={m.alt} />
          </button>
        ))}
      </div>
      <dialog ref={ref} className="image-dialog" onClose={() => setZoom(false)}>
        {zoom && (
          <>
            <button
              aria-label="Close enlarged image"
              onClick={() => ref.current?.close()}
            >
              <X />
            </button>
            <img src={current?.url} alt={current?.alt} />
          </>
        )}
      </dialog>
    </div>
  );
}
export function SelectionPage({ kind }: { kind: "wishlist" | "compare" }) {
  const shop = useShop();
  const items = shop[kind];
  return (
    <div className="page-container">
      <div className="page-heading">
        <div className="eyebrow">YOUR COLLECTION</div>
        <h1>
          {kind === "wishlist" ? "Your wishlist" : "Compare your next upgrade"}
        </h1>
        <p>
          {kind === "wishlist"
            ? "Keep the things you love in one place."
            : "A clear, side-by-side view of the details that matter."}
        </p>
      </div>
      {!items.length ? (
        <div className="empty-state">
          <Heart size={36} />
          <h2>
            {kind === "wishlist"
              ? "Room for your next favorite"
              : "Make an informed choice"}
          </h2>
          <p>
            {kind === "wishlist"
              ? "Tap the heart on a product to save it here."
              : "Add up to four products from one department."}
          </p>
          <Link className="button primary" href="/categories">
            Explore departments
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="comparison-scroll">
          <table className="comparison-table">
            <tbody>
              <tr>
                <th>Product</th>
                {items.map(({ product: p, skuId }) => (
                  <td key={skuId}>
                    <button
                      className="remove-selection"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => shop.select(kind, p, skuId)}
                    >
                      <X size={16} />
                    </button>
                    <img src={p.media[0]?.url} alt={p.name} />
                    <Link href={`/product/${p.slug}?sku=${skuId}`}>
                      <b>{p.name}</b>
                    </Link>
                    <p>
                      {money(p.skus.find((s) => s.id === skuId)?.price ?? 0)}
                    </p>
                    <CardActions product={p} skuId={skuId} />
                  </td>
                ))}
              </tr>
              {kind === "compare" &&
                [
                  ...new Set(
                    items.flatMap((i) =>
                      Object.keys(
                        (i.product.skus.find((s) => s.id === i.skuId)?.specs ??
                          {}) as object,
                      ),
                    ),
                  ),
                ].map((k) => {
                  const values = items.map((i) =>
                    String(
                      (
                        i.product.skus.find((s) => s.id === i.skuId)
                          ?.specs as Record<string, unknown>
                      )?.[k] ?? "Not specified",
                    ),
                  );
                  return (
                    <tr
                      key={k}
                      className={new Set(values).size > 1 ? "different" : ""}
                    >
                      <th>{k}</th>
                      {values.map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export function FilterToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="button filter-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Filters <ChevronDown size={16} />
      </button>
      <aside className={`filters ${open ? "is-open" : ""}`}>{children}</aside>
    </>
  );
}
