import Decimal from "decimal.js";
export const groups = [
  "Pequeños",
  "Medianos",
  "Grandes",
  "Mamás",
  "Papás",
] as const;
export const categories = [
  "Hogar",
  "Higiene",
  "Bebés",
  "Útiles escolares",
  "Juguetes",
  "Comida",
] as const;
export type Participant = {
  id: string;
  name: string;
  group_name: string;
  balance: string;
  purchased: boolean;
};
export type Product = {
  id: string;
  name: string;
  category: string;
  price: string | null;
  stock: number | null;
  active: boolean;
  availability: string;
};
export type Profile = {
  id: string;
  display_name: string;
  role: "operator" | "admin";
  active: boolean;
};
export type Event = {
  id: string;
  name: string;
  event_date: string;
  state: "draft" | "active" | "closed";
};
export type Item = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
};
export type Purchase = {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_group: string;
  event_id: string;
  operator_id: string;
  created_at: string;
  total: string;
  balance_after: string;
  state: string;
  items: Item[];
  cancellation_reason?: string;
};
export type Snapshot = {
  profile: Profile;
  operators: Profile[];
  events: Event[];
  participants: Participant[];
  products: Product[];
  purchases: Purchase[];
  audit: {
    id: number;
    table_name: string;
    reason: string;
    actor_id: string;
    created_at: string;
    before_value: unknown;
    after_value: unknown;
  }[];
  captured_at: string;
};
export type Receipt = {
  id: string;
  total: string;
  balance_after: string;
  state: string;
};
export type Cart = Record<string, number>;
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
export const hours = (value: string | number) =>
  new Decimal(value).toDecimalPlaces(3).toString();
export const purchasable = (p: Product) =>
  p.active && p.price !== null && p.stock !== null && p.stock > 0;
export function calculateCart(
  cart: Cart,
  products: Product[],
  balance: string,
) {
  const items = products
    .filter((p) => cart[p.id] > 0)
    .map((p) => ({
      ...p,
      quantity: cart[p.id],
      subtotal: new Decimal(p.price ?? 0).mul(cart[p.id]).toString(),
    }));
  const total = items.reduce((v, p) => v.add(p.subtotal), new Decimal(0));
  return {
    items,
    total: total.toString(),
    remaining: new Decimal(balance).minus(total).toString(),
    count: items.reduce((v, p) => v + p.quantity, 0),
    valid:
      items.length > 0 &&
      total.lte(balance) &&
      items.every(
        (p) =>
          purchasable(p) &&
          Number.isInteger(p.quantity) &&
          p.quantity <= (p.stock ?? 0),
      ),
  };
}
export const dateTime = (v: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(v));
