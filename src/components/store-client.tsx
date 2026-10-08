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
import type { Comparison } from "@/domains/comparison";

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(
    path.startsWith("/api/") ? path : `/api/v1/${path}`,
    {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers:
        body instanceof FormData
          ? headers
          : { "Content-Type": "application/json", ...headers },
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
      result.error?.issues?.length
        ? result.error.issues
            .map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join(" → ")}: ${i.message}`,
            )
            .join(". ")
        : (result.error?.message ??
          result.message ??
          "Unable to complete this request."),
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
  clearComparison: () => void;
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
// Memory fallback keeps controls usable when browser storage is unavailable.
const selectionMemory = new Map<string, string>();
function readSelection(key: string) {
  try {
    return localStorage.getItem(key) ?? selectionMemory.get(key) ?? "[]";
  } catch {
    return selectionMemory.get(key) ?? "[]";
  }
}
function writeSelection(key: string, value: string) {
  selectionMemory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session-only fallback. */
  }
  window.dispatchEvent(new Event("ift-selection"));
}
function useSelectionStore(key: string) {
  const snapshot = useSyncExternalStore(
    subscribeSelection,
    () => readSelection(key),
    () => "[]",
  );
  const value = useMemo<Selection[]>(() => {
    try {
      const parsed = JSON.parse(snapshot);
      return Array.isArray(parsed)
        ? parsed
            .filter(
              (item) =>
                item &&
                typeof item.skuId === "string" &&
                item.product &&
                typeof item.product.name === "string" &&
                typeof item.product.slug === "string" &&
                typeof item.product.category?.id === "string" &&
                Array.isArray(item.product.skus) &&
                Array.isArray(item.product.media) &&
                item.product.skus.some(
                  (sku: { id?: string; price?: number }) =>
                    sku?.id === item.skuId && Number.isFinite(sku.price),
                ),
            )
            .slice(0, key === "ift-compare" ? 4 : 100)
        : [];
    } catch {
      return [];
    }
  }, [snapshot, key]);
  const set = (next: Selection[]) => {
    writeSelection(key, JSON.stringify(next));
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
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const initial = readSelection(wishlistKey);
    void (async () => {
      try {
        const items = await api<Selection[]>("account/wishlist");
        if (cancelled || readSelection(wishlistKey) !== initial) return;
        writeSelection(wishlistKey, JSON.stringify(items));
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
      value={{
        count,
        wishlist,
        compare,
        refresh,
        select,
        message: setToast,
        clearComparison: () => setCompare([]),
      }}
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
  categories: {
    id?: string;
    name: string;
    slug: string;
    parentId?: string | null;
    icon?: string;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        hovered.current = false;
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div
      ref={root}
      className="department"
      onPointerEnter={(event) => {
        clearTimeout(timer.current);
        if (
          event.pointerType === "mouse" &&
          window.matchMedia("(hover: hover)").matches &&
          !open
        ) {
          hovered.current = true;
          setOpen(true);
        }
      }}
      onPointerLeave={() => {
        timer.current = setTimeout(() => {
          if (!root.current?.contains(document.activeElement)) {
            setOpen(false);
            hovered.current = false;
          }
        }, 180);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          hovered.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          hovered.current = false;
          button.current?.focus();
        }
        if (event.key === "ArrowDown" && event.target === button.current) {
          event.preventDefault();
          setOpen(true);
          setTimeout(() => root.current?.querySelector("a")?.focus(), 0);
        }
      }}
    >
      <button
        ref={button}
        className="department-button"
        onClick={() => {
          clearTimeout(timer.current);
          if (hovered.current) {
            hovered.current = false;
            setOpen(true);
          } else setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls="department-menu"
      >
        <Menu size={18} />
        All departments
        <ChevronDown size={15} />
      </button>
      {open && (
        <div id="department-menu" className="mega-menu">
          <div className="mega-heading">
            <strong>Shop by department</strong>
            <button
              type="button"
              aria-label="Close departments"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div className="mega-departments">
            {categories
              .filter(
                (c) =>
                  !c.parentId ||
                  !categories.some((parent) => parent.id === c.parentId),
              )
              .map((c) => (
                <div key={c.slug} className="mega-group">
                  <Link
                    href={`/category/${c.slug}`}
                    onClick={() => setOpen(false)}
                  >
                    {c.icon && (
                      <img
                        src={`/illustrations/${c.icon}.svg`}
                        width="44"
                        height="36"
                        alt=""
                      />
                    )}
                    <strong>{c.name}</strong>
                    <ArrowRight size={14} />
                  </Link>
                  {categories
                    .filter((child) => child.parentId === c.id && c.id)
                    .map((child) => (
                      <Link
                        className="mega-child"
                        key={child.slug}
                        href={`/category/${child.slug}`}
                        onClick={() => setOpen(false)}
                      >
                        {child.name}
                      </Link>
                    ))}
                </div>
              ))}
          </div>
          <div className="mega-quick-links">
            <Link href="/offers" onClick={() => setOpen(false)}>
              Offers
            </Link>
            <Link href="/new-arrivals" onClick={() => setOpen(false)}>
              New arrivals
            </Link>
            <Link href="/brands" onClick={() => setOpen(false)}>
              Brands
            </Link>
            <Link href="/account" onClick={() => setOpen(false)}>
              My account
            </Link>
          </div>
          <Link href="/categories" onClick={() => setOpen(false)}>
            Browse all departments
          </Link>
        </div>
      )}
    </div>
  );
}
export function SearchBox({
  categories = [],
}: {
  categories?: { name: string; slug: string }[];
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<{
    key: string;
    items: PublicProduct[];
    error?: boolean;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const key = `${category}:${q.trim()}`;
  const current = result?.key === key ? result : null;
  const items = current?.items ?? [];
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/storefront/search?${new URLSearchParams({ q: q.trim(), category, limit: "5" })}`,
          { signal: ctrl.signal },
        );
        if (!response.ok) throw new Error("Search unavailable");
        const data = await response.json();
        if (!ctrl.signal.aborted)
          setResult({ key, items: data.data?.products ?? [] });
      } catch {
        if (!ctrl.signal.aborted) setResult({ key, items: [], error: true });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, category, key]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const showing = open && q.trim().length >= 2;
  return (
    <form
      ref={root}
      action="/search"
      className="search-box"
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onSubmit={(event) => {
        if (active >= 0 && items[active]) {
          event.preventDefault();
          router.push(
            `/product/${items[active].slug}?sku=${items[active].skus[0]?.id ?? ""}`,
          );
        }
        setOpen(false);
      }}
    >
      <select
        name="category"
        aria-label="Search department"
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          setActive(-1);
        }}
      >
        <option value="">All departments</option>
        {categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        name="q"
        value={q}
        maxLength={100}
        onChange={(event) => {
          setQ(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search technology, brands, model or SKU…"
        aria-label="Search products"
        role="combobox"
        aria-expanded={showing}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={
          showing && active >= 0 && items[active]
            ? `suggestion-${active}`
            : undefined
        }
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive(Math.min(active + 1, items.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(active - 1, -1));
          }
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {q && (
        <button
          className="search-clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQ("");
            setActive(-1);
            root.current?.querySelector("input")?.focus();
          }}
        >
          <X size={16} />
        </button>
      )}
      <button aria-label="Submit search">
        <Search size={20} />
      </button>
      {showing && (
        <div className="search-panel">
          <p className="search-caption" role="status">
            {!current
              ? "Searching…"
              : current.error
                ? "Suggestions unavailable. Submit to try the full search."
                : items.length
                  ? "Matching products"
                  : "No matching products. Try a brand, model or another department."}
          </p>
          <ul id="search-results" className="search-results" role="listbox">
            {items.map((p, i) => (
              <li
                key={p.id}
                role="option"
                id={`suggestion-${i}`}
                aria-selected={active === i}
              >
                <Link
                  href={`/product/${p.slug}?sku=${p.skus[0]?.id ?? ""}`}
                  onClick={() => setOpen(false)}
                >
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
          <Link
            className="search-all"
            href={`/search?${new URLSearchParams({ q: q.trim(), category })}`}
            onClick={() => setOpen(false)}
          >
            View all search results <ArrowRight size={16} />
          </Link>
        </div>
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
            await api("storefront/carts", {
              skuId: sku.id,
              quantity: 1,
              mode: "add",
            });
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
              await api("storefront/carts", {
                skuId: sku.id,
                quantity,
                mode: "add",
              });
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
  if (kind === "compare") return <ComparisonPage />;
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function ComparisonPage() {
  const shop = useShop();
  const key = shop.compare.map((item) => item.skuId).join(",");
  const [result, setResult] = useState<{
    key: string;
    data?: Comparison;
    error?: string;
  } | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [revision, setRevision] = useState(0);
  const [purpose, setPurpose] = useState("work");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<{
    key: string;
    summary: string;
    cautions: string[];
    disclaimer: string;
  } | null>(null);
  const [aiError, setAiError] = useState("");
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const load = () =>
      fetch(`/api/v1/storefront/comparison?skus=${encodeURIComponent(key)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const value = await response.json();
          if (!response.ok)
            throw new Error(
              value.error?.message ??
                "We couldn’t load the current comparison.",
            );
          if (!controller.signal.aborted) setResult({ key, data: value.data });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({ key, error: error.message });
        });
    void load();
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, [key, revision]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const aiKey = `${key}:${data?.checkedAt}:${purpose}`;
  return (
    <div className="page-container">
      <div className="page-heading">
        <div className="eyebrow">MAKE ROOM FOR THE RIGHT CHOICE</div>
        <h1>Compare your next upgrade</h1>
        <p>
          Current prices and listed specifications, side by side. Compare up to
          four configurations from one department.
        </p>
      </div>
      {!key ? (
        <div className="empty-state">
          <ChartNoAxesColumnIncreasing size={40} />
          <h2>Make an informed choice</h2>
          <p>
            Choose Compare on a product to start. You can compare different
            configurations of the same product too.
          </p>
          <Link className="button primary" href="/categories">
            Explore departments <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="comparison-controls">
            <label className="check-label">
              <input
                type="checkbox"
                checked={onlyDifferences}
                disabled={(data?.items.length ?? 0) < 2}
                onChange={(event) => setOnlyDifferences(event.target.checked)}
              />
              Show differences only
            </label>
            <button
              className="text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh prices
            </button>
            <button className="text-button" onClick={shop.clearComparison}>
              Clear comparison
            </button>
          </div>
          {current?.error && (
            <p className="notice warning" role="alert">
              {current.error}
            </p>
          )}
          {!current && (
            <p className="notice" role="status">
              Loading current product details…
            </p>
          )}
          {Boolean(data?.unavailableIds.length) && (
            <div className="notice warning">
              <p>
                Some selected configurations are no longer published or
                available for comparison.
              </p>
              {shop.compare
                .filter((item) => data!.unavailableIds.includes(item.skuId))
                .map((item) => (
                  <button
                    key={item.skuId}
                    className="text-button"
                    onClick={() =>
                      shop.select("compare", item.product, item.skuId)
                    }
                  >
                    Remove {item.product.name}
                  </button>
                ))}
            </div>
          )}
          {data && data.items.length > 0 && (
            <>
              <section
                className="comparison-summary"
                aria-label="Comparison summary"
              >
                <h2>At a glance</h2>
                {data.summary.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <small>
                  Based on the current catalogue. Prices and stock are checked
                  again at checkout.
                </small>
              </section>
              <p className="comparison-scroll-hint">
                Swipe or scroll across to compare configurations.
              </p>
              <div
                className="comparison-scroll"
                role="region"
                aria-label="Product specification comparison"
                tabIndex={0}
              >
                <table className="comparison-table">
                  <caption className="sr-only">
                    Product specifications and current prices
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Configuration</th>
                      {data.items.map(({ product, skuId }) => {
                        const sku = product.skus.find(
                          (sku) => sku.id === skuId,
                        )!;
                        return (
                          <th scope="col" key={skuId}>
                            <button
                              className="remove-selection"
                              aria-label={`Remove ${product.name} ${sku.code}`}
                              onClick={() =>
                                shop.select("compare", product, skuId)
                              }
                            >
                              <X size={16} />
                            </button>
                            <img
                              src={
                                product.media[0]?.url ??
                                "/illustrations/laptop.svg"
                              }
                              alt={product.media[0]?.alt ?? product.name}
                            />
                            <Link
                              href={`/product/${product.slug}?sku=${skuId}`}
                            >
                              <b>{product.name}</b>
                            </Link>
                            <small>{sku.code}</small>
                            <p>{money(sku.price)}</p>
                            <CardActions product={product} skuId={skuId} />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows
                      .filter((row) => !onlyDifferences || row.different)
                      .map((row) => (
                        <tr
                          key={row.key}
                          className={row.different ? "different" : ""}
                        >
                          <th scope="row">{row.label}</th>
                          {row.values.map((value, i) => (
                            <td key={data.items[i].skuId}>{value}</td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {onlyDifferences && !data.rows.some((row) => row.different) && (
                <p className="notice">
                  No differences in the listed specifications.
                </p>
              )}
              {data.aiAvailable && data.items.length >= 2 && (
                <section className="comparison-summary">
                  <h2>Explain the tradeoffs</h2>
                  <p>
                    Get an optional AI explanation using these listed
                    specifications.
                  </p>
                  <label>
                    What will you use it for?
                    <select
                      value={purpose}
                      onChange={(event) => setPurpose(event.target.value)}
                    >
                      {["work", "study", "gaming", "travel"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setAiError("");
                      try {
                        const answer = await api<{
                          summary: string;
                          cautions: string[];
                          disclaimer: string;
                        }>("storefront/comparison/insights", {
                          skuIds: data.items.map((item) => item.skuId),
                          purpose,
                        });
                        setAi({ ...answer, key: aiKey });
                      } catch (error) {
                        setAiError((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Preparing explanation…" : "Explain with AI"}
                  </button>
                  {aiError && (
                    <p className="notice warning" role="alert">
                      {aiError}
                    </p>
                  )}
                  {ai?.key === aiKey && (
                    <div>
                      <p>{ai.summary}</p>
                      <ul>
                        {ai.cautions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      <small>{ai.disclaimer}</small>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
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
