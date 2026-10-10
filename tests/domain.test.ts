import { describe, it, expect } from "vitest";
import {
  calculateCart,
  normalize,
  purchasable,
  type Product,
} from "../src/domain";
const product: Product = {
  id: "p",
  name: "Artículo sintético",
  category: "Hogar",
  price: "0.1",
  stock: 3,
  active: true,
  availability: "available",
};
describe("Carrito exacto", () => {
  it("suma decimal exacto y saldo restante sin coma flotante", () => {
    expect(calculateCart({ p: 3 }, [product], "0.3")).toMatchObject({
      total: "0.3",
      remaining: "0",
      count: 3,
      valid: true,
    });
  });
  it("rechaza saldo insuficiente", () =>
    expect(calculateCart({ p: 3 }, [product], "0.2").valid).toBe(false));
  it("rechaza stock insuficiente", () =>
    expect(calculateCart({ p: 4 }, [product], "20").valid).toBe(false));
  it.each([
    { ...product, price: null },
    { ...product, stock: null },
    { ...product, stock: 0 },
    { ...product, active: false },
  ])("bloquea agotados y datos pendientes %#", (p) => {
    expect(purchasable(p)).toBe(false);
    expect(calculateCart({ p: 1 }, [p], "20").valid).toBe(false);
  });
  it("rechaza cantidades fraccionarias y carrito vacío", () => {
    expect(calculateCart({ p: 1.5 }, [product], "20").valid).toBe(false);
    expect(calculateCart({}, [product], "20").valid).toBe(false);
  });
  it("normaliza acentos, capitalización y espacios para búsqueda", () =>
    expect(normalize("  JOSÉ   Pérez  ")).toBe("jose perez"));
});
