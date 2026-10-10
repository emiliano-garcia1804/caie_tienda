import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useBlocker,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Home,
  LogOut,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Users,
  Settings,
  Minus,
  History,
  Download,
  HeartHandshake,
} from "lucide-react";
import { supabase, rpc, snapshot, simpleAccess } from "./api";
import {
  calculateCart,
  categories,
  dateTime,
  groups,
  hours,
  normalize,
  purchasable,
  type Cart,
  type Participant,
  type Product,
  type Receipt,
  type Snapshot,
} from "./domain";
import {
  downloadExcel,
  exportWorkbook,
  inspectWorkbook,
  type ImportPlan,
} from "./excel";

const logo = `${import.meta.env.BASE_URL}caie.jpeg`;
function Brand() {
  return (
    <Link to="/" className="brand">
      <img src={logo} alt="CAIE" />
      <span>
        CAIE <strong>Tienda</strong>
        <small>Aprender. Compartir. Crecer.</small>
      </span>
    </Link>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <ShoppingBag size={32} />
      <p>{children}</p>
    </div>
  );
}
function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      {children}
    </div>
  );
}
function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="back" to={to}>
      <ArrowLeft size={18} />
      {children}
    </Link>
  );
}
function SearchBox({
  value,
  onChange,
  label = "Buscar por nombre",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="search">
      <Search size={20} />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Status({ purchased }: { purchased: boolean }) {
  return (
    <span className={`badge ${purchased ? "done" : "pending"}`}>
      {purchased ? <Check size={13} /> : <Clock3 size={13} />}{" "}
      {purchased ? "Ya compró" : "Pendiente"}
    </span>
  );
}
function Login({ accessError }: { accessError?: string | null }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch {
      setError("No pudimos iniciar sesión. Verifica tus datos y la conexión.");
    } finally {
      setBusy(false);
    }
  }
  if (simpleAccess)
    return (
      <main className="login">
        <section className="login-story">
          <img src={logo} alt="Logotipo oficial de CAIE" />
          <span className="eyebrow">BIENVENIDOS A CAIE TIENDA</span>
          <h1>Una tienda para nuestra comunidad.</h1>
          <p>Registra compras y descarga el Excel de forma sencilla.</p>
        </section>
        <section className="login-form">
          <Brand />
          <h2>Abre el enlace de tu teléfono</h2>
          <p>
            Usa el enlace privado que te compartió la persona responsable de
            CAIE. Solo necesitas abrirlo una vez; después puedes volver a esta
            página directamente.
          </p>
          {accessError && <Alert>{accessError}</Alert>}
          <small>
            Si borraste los datos del navegador o cerraste el acceso, solicita
            un enlace nuevo.
          </small>
        </section>
      </main>
    );
  return (
    <main className="login">
      <section className="login-story">
        <img src={logo} alt="Logotipo oficial de CAIE" />
        <span className="eyebrow">BIENVENIDOS A CAIE TIENDA</span>
        <h1>
          El aprendizaje
          <br />
          se convierte en bienestar.
        </h1>
        <p>Un espacio para compartir, acompañar y hacer comunidad.</p>
      </section>
      <section className="login-form">
        <Brand />
        <h2>Hola, qué bueno verte.</h2>
        <p>Inicia sesión con el acceso de CAIE.</p>
        <form onSubmit={submit}>
          <label>
            Correo electrónico
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <Alert>{error}</Alert>}
          <button className="primary" disabled={busy}>
            {busy ? "Iniciando sesión…" : "Entrar a la tienda"}
            <ArrowRight size={18} />
          </button>
        </form>
        <small>Solicita el acceso a la persona responsable de CAIE.</small>
      </section>
    </main>
  );
}
export default function App({ accessError }: { accessError?: string | null }) {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading"),
    [online, setOnline] = useState(navigator.onLine),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const client = useQueryClient();
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setAuth(data.session ? "in" : "out");
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuth(session ? "in" : "out");
      if (event === "SIGNED_OUT")
        client.removeQueries({ queryKey: ["snapshot"] });
      else if (event === "SIGNED_IN")
        void client.invalidateQueries({ queryKey: ["snapshot"] });
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const query = useQuery({
    queryKey: ["snapshot"],
    queryFn: snapshot,
    enabled: auth === "in",
  });
  useEffect(() => {
    if (auth !== "in") return;
    const channel = supabase
      .channel("tienda")
      .on("postgres_changes", { event: "*", schema: "public" }, () =>
        client.invalidateQueries({ queryKey: ["snapshot"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [auth, client]);
  if (auth === "loading")
    return <div className="loading">Preparando CAIE Tienda…</div>;
  if (auth === "out") return <Login accessError={accessError} />;
  if (!query.data)
    return (
      <main className="standalone">
        <Brand />
        {query.isError ? (
          <>
            <Alert>No pudimos cargar la tienda: {query.error.message}</Alert>
            <button onClick={() => query.refetch()}>Reintentar</button>
            <button onClick={() => supabase.auth.signOut({ scope: "local" })}>
              {simpleAccess
                ? "Cerrar acceso de este teléfono"
                : "Cerrar sesión"}
            </button>
          </>
        ) : (
          <p role="status">Cargando la tienda…</p>
        )}
      </main>
    );
  const data = query.data;
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["snapshot"] });
  };
  const download = async () => {
    setExporting(true);
    setExportError("");
    try {
      downloadExcel(
        await exportWorkbook(await rpc<Snapshot>("export_snapshot")),
      );
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="app">
      <header>
        <Brand />
        {simpleAccess ? (
          <div className="operator">
            <button
              className="secondary quick-export"
              disabled={exporting}
              onClick={download}
              aria-label="Descargar Excel actualizado"
            >
              <Download size={19} />
              <span>Excel</span>
            </button>
          </div>
        ) : (
          <div className="operator">
            <Link to="/account" aria-label="Mi cuenta" className="avatar">
              {data.profile.display_name.charAt(0)}
            </Link>
            <span>
              {data.profile.display_name}
              <small>
                {data.profile.role === "admin"
                  ? "Gestionar tienda"
                  : "Voluntariado"}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={() => supabase.auth.signOut({ scope: "local" })}
            >
              <LogOut size={19} />
            </button>
          </div>
        )}
      </header>
      <nav className="navigation">
        <Link to="/">
          <Home size={18} />
          Inicio
        </Link>
        <Link to="/groups">
          <ShoppingBag size={18} />
          Nueva compra
        </Link>
        <Link to="/inventory">
          <Package size={18} />
          Inventario
        </Link>
        <Link to="/history">
          <History size={18} />
          Historial
        </Link>
        {data.profile.role === "admin" && (
          <Link to="/admin">
            <Settings size={18} />
            Gestionar tienda
          </Link>
        )}
      </nav>
      <main className="content">
        {exportError && <Alert>{exportError}</Alert>}
        {!online && (
          <Alert>
            Sin conexión. Puedes revisar esta pantalla; las compras requieren
            conexión.
          </Alert>
        )}
        {query.isError && (
          <Alert>
            No se pudo actualizar la información. {query.error.message}{" "}
            <button onClick={() => query.refetch()}>Reintentar</button>
          </Alert>
        )}
        <Routes>
          <Route path="/" element={<Start data={data} />} />
          <Route path="/groups" element={<Groups data={data} />} />
          <Route path="/groups/:group" element={<Participants data={data} />} />
          <Route
            path="/buy/:id"
            element={<Checkout data={data} refresh={refresh} online={online} />}
          />
          <Route
            path="/account"
            element={simpleAccess ? <Navigate to="/" replace /> : <Account />}
          />
          <Route path="/inventory" element={<Inventory data={data} />} />
          <Route
            path="/history"
            element={<PurchaseHistory data={data} refresh={refresh} />}
          />
          <Route
            path="/admin"
            element={
              data.profile.role === "admin" ? (
                <Admin data={data} refresh={refresh} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer>
        <HeartHandshake size={16} /> Hecho para nuestra comunidad CAIE{" "}
        <span>La información se actualiza automáticamente</span>
      </footer>
    </div>
  );
}
function Start({ data }: { data: Snapshot }) {
  const active = data.events.find((e) => e.state === "active");
  const bought = data.participants.filter((p) => p.purchased).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UN DÍA PARA COMPARTIR</span>
          <h1>Bienvenido a la tienda</h1>
          <p>Cada hora de aprendizaje abre nuevas posibilidades.</p>
        </div>
        <span className="event-pill">
          <span className="dot" />
          {active?.name ?? "Sin evento activo"}
        </span>
      </div>
      <section className="hero">
        <div>
          <span className="hero-label">CAIE TIENDA</span>
          <h2>
            Vamos a atender
            <br />a nuestra comunidad.
          </h2>
          <p>
            Elige un participante, agrega sus artículos y registra la compra.
            Nosotros llevamos las cuentas.
          </p>
          <Link
            className={`primary ${!active ? "disabled" : ""}`}
            to={active ? "/groups" : "/"}
            aria-disabled={!active}
          >
            <ShoppingBag size={21} />
            Nueva compra
            <ArrowRight size={20} />
          </Link>
          {!active && (
            <small>
              Gestionar tienda debe activar un evento para comenzar.
            </small>
          )}
        </div>
        <div className="hero-art">
          <img src={logo} alt="CAIE, ilustración de jirafa" />
        </div>
      </section>
      <div className="summary-row">
        <div>
          <span className="metric-icon blue">
            <Users />
          </span>
          <strong>{data.participants.length}</strong>
          <span>Participantes</span>
        </div>
        <div>
          <span className="metric-icon green">
            <CheckCircle2 />
          </span>
          <strong>{bought}</strong>
          <span>Ya compraron</span>
        </div>
        <div>
          <span className="metric-icon yellow">
            <Package />
          </span>
          <strong>{data.products.filter(purchasable).length}</strong>
          <span>Productos disponibles</span>
        </div>
      </div>
      <h2 className="section-title">Todo a la mano</h2>
      <div className="quick-links">
        <Link to="/inventory">
          <Package />
          <div>
            <h3>Consultar inventario</h3>
            <p>Productos, precios y existencias.</p>
          </div>
          <ArrowRight />
        </Link>
        <Link to="/history">
          <History />
          <div>
            <h3>Ver historial</h3>
            <p>Las compras registradas en la tienda.</p>
          </div>
          <ArrowRight />
        </Link>
      </div>
      <div className="kind-note">
        <HeartHandshake />
        <p>
          Atendemos con calma y cariño. Antes de confirmar, revisa el nombre y
          los artículos con el participante.
        </p>
      </div>
    </>
  );
}
function Groups({ data }: { data: Snapshot }) {
  return (
    <>
      <Back to="/">Inicio</Back>
      <span className="eyebrow">NUEVA COMPRA · PASO 1 DE 3</span>
      <h1>¿A qué grupo pertenece?</h1>
      <p>Selecciona el grupo para encontrar al participante.</p>
      <div className="group-grid">
        {groups.map((g, i) => (
          <Link
            className={`group-card group-${i}`}
            key={g}
            to={`/groups/${encodeURIComponent(g)}`}
          >
            <span className="group-icon">
              <Users size={30} />
            </span>
            <h2>{g}</h2>
            <span>
              {data.participants.filter((p) => p.group_name === g).length}{" "}
              participantes
            </span>
            <ArrowRight />
          </Link>
        ))}
      </div>
    </>
  );
}
function Participants({ data }: { data: Snapshot }) {
  const { group } = useParams(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Todos");
  const list = data.participants
    .filter(
      (p) =>
        p.group_name === group &&
        normalize(p.name).includes(normalize(search)) &&
        (filter === "Todos" || p.purchased === (filter === "Ya compraron")),
    )
    .sort(
      (a, b) =>
        Number(a.purchased) - Number(b.purchased) ||
        a.name.localeCompare(b.name, "es"),
    );
  return (
    <>
      <Back to="/groups">Cambiar grupo</Back>
      <span className="eyebrow">NUEVA COMPRA · PASO 2 DE 3</span>
      <h1>{group}</h1>
      <p>Encuentra a la persona que vamos a atender.</p>
      <SearchBox value={search} onChange={setSearch} />
      <div className="chips">
        {["Todos", "Pendientes", "Ya compraron"].map((f) => (
          <button
            aria-pressed={filter === f}
            className={filter === f ? "selected" : ""}
            key={f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <p className="result-count">{list.length} participantes</p>
      <div className="participant-grid">
        {list.map((p) => (
          <Link key={p.id} to={`/buy/${p.id}`} className="participant-card">
            <span className="person-avatar">{p.name.charAt(0)}</span>
            <div>
              <h3>{p.name}</h3>
              <Status purchased={p.purchased} />
            </div>
            <div className="balance">
              <strong>{hours(p.balance)}</strong>
              <small>horas</small>
              <ArrowRight size={16} />
            </div>
          </Link>
        ))}
      </div>
      {!list.length && (
        <Empty>No encontramos participantes con estos filtros.</Empty>
      )}
    </>
  );
}
function ProductCard({
  p,
  quantity = 0,
  change,
}: {
  p: Product;
  quantity?: number;
  change?: (n: number) => void;
}) {
  return (
    <article className={`product-card ${!purchasable(p) ? "unavailable" : ""}`}>
      <span
        className={`product-icon category-${categories.indexOf(p.category as (typeof categories)[number])}`}
      >
        <Package size={24} />
      </span>
      <div className="product-description">
        <small>{p.category}</small>
        <h3>{p.name}</h3>
        <p>
          {p.price === null
            ? "Precio pendiente"
            : `${hours(p.price)} ${p.price === "1" ? "hora" : "horas"}`}
          <span>
            {" "}
            ·{" "}
            {p.stock === null
              ? "Existencias pendientes"
              : `${p.stock} disponibles`}
          </span>
        </p>
        {!purchasable(p) && (
          <span className="badge">
            {p.stock === 0 && p.price !== null && p.active
              ? "Agotado"
              : "No disponible"}
          </span>
        )}
      </div>
      {change && (
        <div className="quantity">
          <button
            aria-label={`Quitar ${p.name}`}
            disabled={!quantity}
            onClick={() => change(Math.max(0, quantity - 1))}
          >
            <Minus size={17} />
          </button>
          <output aria-label={`Cantidad de ${p.name}`}>{quantity}</output>
          <button
            aria-label={`Agregar ${p.name}`}
            disabled={!purchasable(p) || quantity >= (p.stock ?? 0)}
            onClick={() => change(quantity + 1)}
          >
            <Plus size={17} />
          </button>
        </div>
      )}
    </article>
  );
}
function ProductFilters({
  search,
  setSearch,
  category,
  setCategory,
}: {
  search: string;
  setSearch: (s: string) => void;
  category: string;
  setCategory: (s: string) => void;
}) {
  return (
    <>
      <SearchBox value={search} onChange={setSearch} label="Buscar productos" />
      <div className="chips category-chips">
        {["Todas", ...categories].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            className={category === c ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </>
  );
}
function Inventory({ data }: { data: Snapshot }) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todas");
  return (
    <>
      <Back to="/">Inicio</Back>
      <h1>Inventario</h1>
      <p>Consulta lo que tenemos para compartir.</p>
      <ProductFilters {...{ search, setSearch, category, setCategory }} />
      <div className="catalog">
        {data.products
          .filter(
            (p) =>
              normalize(p.name).includes(normalize(search)) &&
              (category === "Todas" || p.category === category),
          )
          .map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
      </div>
    </>
  );
}
function Checkout({
  data,
  refresh,
  online,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
  online: boolean;
}) {
  const { id } = useParams(),
    navigate = useNavigate(),
    person = data.participants.find((p) => p.id === id),
    event = data.events.find((e) => e.state === "active");
  const [cart, setCart] = useState<Cart>({}),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todas"),
    [stage, setStage] = useState<"edit" | "confirm" | "success">("edit"),
    [warned, setWarned] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [attempt, setAttempt] = useState<{
      key: string;
      event: string;
      items: { product_id: string; quantity: number; expected_price: string }[];
    } | null>(null);
  const [savedItems, setSavedItems] = useState<
      ReturnType<typeof calculateCart>["items"]
    >([]),
    [cartExpanded, setCartExpanded] = useState(false),
    [savedBalance, setSavedBalance] = useState("0");
  const calculation = attempt
    ? calculateCart(cart, savedItems, savedBalance)
    : calculateCart(cart, data.products, person?.balance ?? "0");
  const blocker = useBlocker(!!attempt);
  useEffect(() => {
    if (blocker.state === "blocked") {
      setError(
        "Primero recupera el resultado de la compra pendiente con Reintentar confirmación.",
      );
      blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (attempt) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [attempt]);
  if (!person) return <Empty>Participante no encontrado.</Empty>;
  const confirm = async () => {
    if (
      busy ||
      !online ||
      (!attempt && !calculation.valid) ||
      (!attempt && !event)
    )
      return;
    const request = attempt ?? {
      key: crypto.randomUUID(),
      event: event!.id,
      items: calculation.items.map((p) => ({
        product_id: p.id,
        quantity: p.quantity,
        expected_price: p.price!,
      })),
    };
    if (!attempt) {
      setSavedItems(calculation.items);
      setSavedBalance(person.balance);
    }
    setAttempt(request);
    setBusy(true);
    setError("");
    try {
      const result = await rpc<Receipt>("confirm_purchase", {
        p_participant: person.id,
        p_event: request.event,
        p_key: request.key,
        p_items: request.items,
      });
      setReceipt(result);
      setStage("success");
      setAttempt(null);
      await refresh();
    } catch (e) {
      const err = e as Error & { definitive?: boolean };
      if (err.definitive) setAttempt(null);
      setError(err.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  if (stage === "success" && receipt)
    return (
      <section className="success">
        <span className="success-icon">
          <CheckCircle2 size={48} />
        </span>
        <span className="eyebrow">TODO LISTO</span>
        <h1>Compra registrada correctamente</h1>
        <h2>{person.name}</h2>
        <p>{person.group_name}</p>
        <div className="receipt-summary">
          <div>
            <span>Horas gastadas</span>
            <strong>{hours(receipt.total)}</strong>
          </div>
          <div>
            <span>Nuevo saldo</span>
            <strong>{hours(receipt.balance_after)} h</strong>
          </div>
          <div>
            <span>Artículos</span>
            <strong>{savedItems.reduce((n, i) => n + i.quantity, 0)}</strong>
          </div>
        </div>
        {savedItems.map((i) => (
          <div className="receipt-item" key={i.id}>
            <span>
              {i.quantity} × {i.name}
            </span>
            <strong>{hours(i.subtotal)} h</strong>
          </div>
        ))}
        <small>Referencia: {receipt.id}</small>
        {receipt.state === "cancelled" && (
          <Alert>Esta compra ya fue anulada. Consulta el historial.</Alert>
        )}
        <Link className="primary" to="/groups">
          Nueva compra
          <ArrowRight size={18} />
        </Link>
        <Link className="secondary" to="/">
          Volver al inicio
        </Link>
      </section>
    );
  if (
    person.purchased &&
    !warned &&
    !attempt &&
    Object.values(cart).every((n) => n === 0)
  )
    return (
      <section className="repeat-warning">
        <Back to={`/groups/${encodeURIComponent(person.group_name)}`}>
          Participantes
        </Back>
        <h1>{person.name}</h1>
        <Alert>
          Este participante ya realizó una compra durante esta CAIE Tienda.
          ¿Deseas continuar?
        </Alert>
        <p>Puede realizar otra compra si todavía tiene horas disponibles.</p>
        <button className="primary" onClick={() => setWarned(true)}>
          Continuar con la compra
        </button>
      </section>
    );
  return (
    <>
      <Back to={`/groups/${encodeURIComponent(person.group_name)}`}>
        Participantes
      </Back>
      <span className="eyebrow">NUEVA COMPRA · PASO 3 DE 3</span>
      <div className="page-heading">
        <div>
          <h1>
            {stage === "confirm" ? "Revisar compra" : "Seleccionar artículos"}
          </h1>
          <p>
            {person.name} <span className="muted">· {person.group_name}</span>
          </p>
        </div>
        <div className="hours-pill">
          <Clock3 size={19} />
          <strong>{hours(person.balance)} h</strong> disponibles
        </div>
      </div>
      {!event && (
        <Alert>
          El evento está cerrado. No se pueden registrar nuevas compras.
        </Alert>
      )}
      {error && (
        <Alert>
          {error}
          {attempt && (
            <p>
              La respuesta no confirmó el resultado. Reintenta con el mismo
              identificador para recuperar la compra sin duplicarla. Mantén esta
              pantalla abierta.
            </p>
          )}
        </Alert>
      )}
      <div className="checkout-layout">
        <section>
          {stage === "edit" ? (
            <>
              <ProductFilters
                {...{ search, setSearch, category, setCategory }}
              />
              <div className="catalog">
                {data.products
                  .filter(
                    (p) =>
                      normalize(p.name).includes(normalize(search)) &&
                      (category === "Todas" || p.category === category),
                  )
                  .map((p) => (
                    <ProductCard
                      key={p.id}
                      p={p}
                      quantity={cart[p.id]}
                      change={(n) => setCart((c) => ({ ...c, [p.id]: n }))}
                    />
                  ))}
              </div>
            </>
          ) : (
            <section className="panel">
              <h2>Confirma los artículos con el participante</h2>
              <CartItems calculation={calculation} />
              <p>
                Saldo inicial: <strong>{hours(person.balance)} horas</strong>
              </p>
              <button
                className="secondary"
                disabled={busy || !!attempt}
                onClick={() => setStage("edit")}
              >
                Volver a editar
              </button>
            </section>
          )}
        </section>
        <aside
          className={`cart panel ${stage === "edit" ? "preview" : ""} ${cartExpanded ? "expanded" : ""}`}
        >
          <h2>
            <ShoppingBag size={22} />
            Tu carrito
          </h2>
          <button
            className="cart-toggle"
            aria-expanded={cartExpanded}
            onClick={() => setCartExpanded((v) => !v)}
          >
            {cartExpanded ? "Ocultar artículos" : "Ver artículos"} (
            {calculation.count})
          </button>
          {stage === "edit" && <CartItems calculation={calculation} />}
          <div className="cart-total">
            <span>{calculation.count} artículos · Total</span>
            <strong>{hours(calculation.total)} h</strong>
          </div>
          <div
            className={`remaining ${Number(calculation.remaining) < 0 ? "negative" : ""}`}
          >
            <span>Saldo restante</span>
            <strong>{hours(calculation.remaining)} horas</strong>
          </div>
          {Number(calculation.remaining) < 0 && (
            <Alert>
              El carrito supera las horas disponibles. Quita algunos artículos.
            </Alert>
          )}
          {calculation.items.some(
            (p) => !purchasable(p) || p.quantity > (p.stock ?? 0),
          ) && (
            <Alert>
              Cambió el inventario. Revisa las cantidades antes de continuar.
            </Alert>
          )}
          <button
            className="primary"
            disabled={
              busy || !online || (!attempt && (!calculation.valid || !event))
            }
            onClick={
              stage === "edit"
                ? () => {
                    setError("");
                    setStage("confirm");
                  }
                : confirm
            }
          >
            {busy
              ? "Registrando…"
              : stage === "edit"
                ? "Revisar compra"
                : attempt
                  ? "Reintentar confirmación"
                  : "Confirmar compra"}
            <ArrowRight size={18} />
          </button>
          <small>
            La compra se guarda al recibir confirmación de la tienda.
          </small>
        </aside>
      </div>
    </>
  );
}
function CartItems({
  calculation,
}: {
  calculation: ReturnType<typeof calculateCart>;
}) {
  return (
    <div className="cart-items">
      {!calculation.items.length ? (
        <p className="muted">Agrega productos para comenzar.</p>
      ) : (
        calculation.items.map((i) => (
          <div key={i.id}>
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.quantity} × {i.price === null ? "Pendiente" : hours(i.price)}{" "}
                h
              </small>
            </span>
            <strong>{hours(i.subtotal)} h</strong>
          </div>
        ))
      )}
    </div>
  );
}
function PurchaseHistory({
  data,
  refresh,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [event, setEvent] = useState(""),
    [group, setGroup] = useState(""),
    [operator, setOperator] = useState(""),
    [date, setDate] = useState(""),
    [cancel, setCancel] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const list = data.purchases.filter(
    (c) =>
      normalize(c.participant_name).includes(normalize(search)) &&
      (!event || c.event_id === event) &&
      (!group || c.participant_group === group) &&
      (!operator || c.operator_id === operator) &&
      (!date ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Mexico_City",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(c.created_at)) === date),
  );
  async function annul(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await rpc("cancel_purchase", { p_purchase: cancel, p_reason: reason });
      setCancel(null);
      setReason("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back to="/">Inicio</Back>
      <h1>Historial de compras</h1>
      <p>Cada intercambio queda registrado aquí.</p>
      <SearchBox
        value={search}
        onChange={setSearch}
        label="Buscar participante"
      />
      <div className="filter-grid">
        <label>
          Evento
          <select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Todos los eventos</option>
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Grupo
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Todos los grupos</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Operador
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
          >
            <option value="">Todos los operadores</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      {!list.length && <Empty>No hay compras con estos filtros.</Empty>}
      <div className="history-list">
        {list.map((c) => (
          <article className="panel purchase" key={c.id}>
            <div className="purchase-heading">
              <div>
                <small>
                  {dateTime(c.created_at)} ·{" "}
                  {data.events.find((e) => e.id === c.event_id)?.name}
                </small>
                <h3>{c.participant_name}</h3>
                <p>
                  {c.participant_group} ·{" "}
                  {
                    data.operators.find((o) => o.id === c.operator_id)
                      ?.display_name
                  }
                </p>
              </div>
              <span
                className={`badge ${c.state === "confirmed" ? "done" : "cancelled"}`}
              >
                {c.state === "confirmed" ? "Confirmada" : "Anulada"}
              </span>
            </div>
            {c.items.map((i) => (
              <div className="receipt-item" key={i.product_id}>
                <span>
                  {i.quantity} × {i.product_name}
                </span>
                <span>{hours(i.subtotal)} h</span>
              </div>
            ))}
            <div className="purchase-total">
              Total <strong>{hours(c.total)} horas</strong>
            </div>
            {c.cancellation_reason && <p>Motivo: {c.cancellation_reason}</p>}
            {data.profile.role === "admin" && c.state === "confirmed" && (
              <button
                className="danger-text"
                onClick={() => {
                  setCancel(c.id);
                  setError("");
                }}
              >
                Anular compra
              </button>
            )}
          </article>
        ))}
      </div>
      {cancel && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
          >
            <h2 id="cancel-title">Anular compra</h2>
            <p>
              Se reintegrarán las horas y se devolverán los artículos al
              inventario. El registro se conservará.
            </p>
            <form onSubmit={annul}>
              <label>
                Motivo
                <textarea
                  autoFocus
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && <Alert>{error}</Alert>}
              <button className="danger" disabled={busy}>
                {busy ? "Anulando…" : "Confirmar anulación"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCancel(null)}
              >
                Volver
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function Admin({
  data,
  refresh,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("Participantes"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(name: string, params?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc(name, params);
      await refresh();
      setMessage("Cambios guardados correctamente.");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const action = async (name: string, params: Record<string, unknown>) => {
    try {
      await act(name, params);
      return true;
    } catch {
      return false;
    }
  };
  async function download() {
    setBusy(true);
    setError("");
    try {
      const confirmed = await rpc<Snapshot>("export_snapshot");
      downloadExcel(await exportWorkbook(confirmed));
      setMessage(
        "Excel descargado con una lectura consistente de la base de datos.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back to="/">Inicio</Back>
      <div className="page-heading">
        <div>
          <h1>Gestionar tienda</h1>
          <p>Cuidemos los recursos de nuestra comunidad.</p>
        </div>
        <button className="primary" disabled={busy} onClick={download}>
          <Download size={18} />
          Descargar Excel actualizado
        </button>
      </div>
      <div className="chips">
        {[
          "Participantes",
          "Productos",
          "Eventos",
          "Importación",
          "Auditoría",
        ].map((t) => (
          <button
            key={t}
            className={t === tab ? "selected" : ""}
            aria-pressed={t === tab}
            onClick={() => {
              setTab(t);
              setMessage("");
              setError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {simpleAccess && (
        <details className="panel">
          <summary>Acceso de este teléfono</summary>
          <p>
            El acceso queda guardado en este navegador. Al cerrarlo necesitarás
            un enlace nuevo para volver a entrar.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => supabase.auth.signOut({ scope: "local" })}
          >
            Cerrar acceso de este teléfono
          </button>
        </details>
      )}
      {tab === "Participantes" && (
        <ParticipantAdmin data={data} action={action} busy={busy} />
      )}{" "}
      {tab === "Productos" && (
        <ProductAdmin data={data} action={action} busy={busy} />
      )}{" "}
      {tab === "Eventos" && (
        <EventAdmin data={data} action={action} busy={busy} />
      )}{" "}
      {tab === "Importación" && <ImportAdmin act={act} busy={busy} />}{" "}
      {tab === "Auditoría" && (
        <>
          <p>
            Últimos 500 movimientos. Los detalles completos se conservan en
            PostgreSQL.
          </p>
          {data.audit.map((a) => (
            <details className="panel audit" key={a.id}>
              <summary>
                {dateTime(a.created_at)} · {a.reason}
                <small>
                  {a.table_name} ·{" "}
                  {data.operators.find((o) => o.id === a.actor_id)
                    ?.display_name ?? "Configuración inicial"}
                </small>
              </summary>
              <div className="audit-values">
                <h4>Antes</h4>
                <pre>{JSON.stringify(a.before_value, null, 2)}</pre>
                <h4>Después</h4>
                <pre>{JSON.stringify(a.after_value, null, 2)}</pre>
              </div>
            </details>
          ))}
        </>
      )}
    </>
  );
}
type AdminProps = {
  data: Snapshot;
  action: (name: string, params: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
};
function ParticipantAdmin({ data, action, busy }: AdminProps) {
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState(""),
    [person, setPerson] = useState<Participant | null | undefined>(),
    [name, setName] = useState(""),
    [newGroup, setNewGroup] = useState(""),
    [balance, setBalance] = useState(""),
    [reason, setReason] = useState("");
  return (
    <div className="admin-layout">
      <section>
        <button
          className="secondary"
          onClick={() => {
            setPerson(null);
            setName("");
            setNewGroup(groups[0]);
            setBalance("");
            setReason("Registro inicial");
          }}
        >
          <Plus size={18} />
          Agregar participante
        </button>
        <SearchBox value={search} onChange={setSearch} />
        <label>
          Grupo
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Todos</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <div className="admin-list">
          {data.participants
            .filter(
              (p) =>
                normalize(p.name).includes(normalize(search)) &&
                (!group || p.group_name === group),
            )
            .map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPerson(p);
                  setName(p.name);
                  setNewGroup(p.group_name);
                  setBalance(p.balance);
                  setReason("");
                }}
              >
                <span>
                  {p.name}
                  <small>{p.group_name}</small>
                </span>
                <strong>{hours(p.balance)} h</strong>
              </button>
            ))}
        </div>
      </section>
      {person !== undefined ? (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void action("admin_participant", {
              p_id: person?.id ?? null,
              p_name: name,
              p_group: newGroup,
              p_balance: balance,
              p_expected_balance: person?.balance ?? null,
              p_reason: reason,
            }).then((saved) => {
              if (saved) setPerson(undefined);
            });
          }}
        >
          <h2>{person ? "Editar participante" : "Nuevo participante"}</h2>
          <label>
            Nombre
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Grupo
            <select
              aria-label="Grupo del participante"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Saldo de horas
            <input
              required
              type="number"
              step="0.001"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </label>
          {person && (
            <label>
              Motivo del ajuste
              <textarea
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            {person ? "Guardar ajuste" : "Guardar participante"}
          </button>
          <Link className="secondary" to="/history">
            Consultar compras
          </Link>
        </form>
      ) : (
        <Empty>
          Selecciona un participante para consultar o ajustar su saldo.
        </Empty>
      )}
    </div>
  );
}
function ProductAdmin({ data, action, busy }: AdminProps) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todas"),
    [filter, setFilter] = useState("Todos"),
    [product, setProduct] = useState<Product | null | undefined>(),
    [name, setName] = useState(""),
    [cat, setCat] = useState<string>(categories[0]),
    [price, setPrice] = useState(""),
    [stock, setStock] = useState(""),
    [active, setActive] = useState(true),
    [reason, setReason] = useState("");
  const edit = (p: Product | null) => {
    setProduct(p);
    setName(p?.name ?? "");
    setCat(p?.category ?? categories[0]);
    setPrice(p?.price ?? "");
    setStock(p?.stock == null ? "" : String(p.stock));
    setActive(p?.active ?? true);
    setReason(p ? "" : "Registro inicial");
  };
  return (
    <div className="admin-layout">
      <section>
        <button className="secondary" onClick={() => edit(null)}>
          <Plus size={18} />
          Agregar producto
        </button>
        <ProductFilters {...{ search, setSearch, category, setCategory }} />
        <label>
          Disponibilidad
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["Todos", "Agotados", "Información pendiente"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <div className="admin-list">
          {data.products
            .filter(
              (p) =>
                normalize(p.name).includes(normalize(search)) &&
                (category === "Todas" || p.category === category) &&
                (filter === "Todos" ||
                  (filter === "Agotados"
                    ? p.stock === 0
                    : p.price === null || p.stock === null)),
            )
            .map((p) => (
              <button key={p.id} onClick={() => edit(p)}>
                <span>
                  {p.name}
                  <small>{p.category}</small>
                </span>
                <strong>{p.stock ?? "NA"} u.</strong>
              </button>
            ))}
        </div>
      </section>
      {product !== undefined ? (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            action("admin_product", {
              p_id: product?.id ?? null,
              p_name: name,
              p_category: cat,
              p_price: price || null,
              p_stock: stock === "" ? null : Number(stock),
              p_active: active,
              p_reason: reason,
              p_expected_stock: product?.stock ?? null,
              p_expected_price: product?.price ?? null,
            });
          }}
        >
          <h2>{product ? "Editar producto" : "Nuevo producto"}</h2>
          <label>
            Nombre
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Categoría
            <select
              aria-label="Categoría del producto"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Precio en horas
            <input
              type="number"
              min="0"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Pendiente"
            />
          </label>
          <label>
            Existencias (unidades)
            <input
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="Pendiente"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Producto activo
          </label>
          {product && (
            <label>
              Motivo
              <textarea
                minLength={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <button className="primary" disabled={busy}>
            Guardar producto
          </button>
        </form>
      ) : (
        <Empty>
          Selecciona un producto para corregir precios o existencias.
        </Empty>
      )}
    </div>
  );
}
function EventAdmin({ data, action, busy }: AdminProps) {
  const [name, setName] = useState(""),
    [date, setDate] = useState("");
  return (
    <div className="admin-layout">
      <section>
        {data.events.map((e) => (
          <article className="panel" key={e.id}>
            <h3>{e.name}</h3>
            <p>
              {e.event_date} ·{" "}
              {e.state === "active"
                ? "Activo"
                : e.state === "closed"
                  ? "Cerrado"
                  : "Pendiente"}
            </p>
            {e.state !== "closed" && (
              <button
                disabled={
                  busy ||
                  (e.state === "draft" &&
                    data.events.some((v) => v.state === "active"))
                }
                onClick={() =>
                  action("admin_event", {
                    p_id: e.id,
                    p_name: null,
                    p_date: null,
                    p_action: e.state === "active" ? "close" : "activate",
                  })
                }
              >
                {e.state === "active" ? "Cerrar evento" : "Activar evento"}
              </button>
            )}
          </article>
        ))}
      </section>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          action("admin_event", {
            p_id: null,
            p_name: name,
            p_date: date,
            p_action: "create",
          });
        }}
      >
        <h2>Preparar nuevo evento</h2>
        <p>
          Los saldos y el inventario se conservarán. El estado de compra
          corresponde a cada evento.
        </p>
        <label>
          Nombre
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Fecha
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          Crear evento
        </button>
      </form>
    </div>
  );
}
function ImportAdmin({
  act,
  busy,
}: {
  act: (name: string, params?: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null),
    [error, setError] = useState(""),
    [approved, setApproved] = useState(false),
    [loading, setLoading] = useState(false);
  async function inspect(file?: File) {
    if (!file) return;
    setLoading(true);
    setPlan(null);
    setError("");
    setApproved(false);
    try {
      setPlan(await inspectWorkbook(await file.arrayBuffer()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="panel">
      <h2>Importación inicial de Excel</h2>
      <p>
        Solo funciona con una base vacía. No sobrescribe saldos ni inventario
        después de comenzar a operar.
      </p>
      <label>
        Archivo original (.xlsx)
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => void inspect(e.target.files?.[0])}
        />
      </label>
      {loading && <p>Validando archivo localmente…</p>}
      {error && <Alert>{error}</Alert>}
      {plan && (
        <>
          <div className="import-summary">
            <p>
              Participantes encontrados y válidos:{" "}
              <strong>{plan.participants.length}</strong>
            </p>
            <p>
              Productos encontrados y válidos:{" "}
              <strong>{plan.products.length}</strong>
            </p>
            <p>
              Registros ambiguos: <strong>{plan.ambiguous.length}</strong>
            </p>
            <p>
              Errores: <strong>{plan.errors.length}</strong>
            </p>
            <p>
              Importados en esta revisión: <strong>0</strong>
            </p>
          </div>
          {plan.warnings.map((w, i) => (
            <p className="warning" key={i}>
              {w}
            </p>
          ))}
          {plan.errors.map((w, i) => (
            <Alert key={i}>{w}</Alert>
          ))}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            Tengo autorización expresa de CAIE para importar estos datos
            personales y se verificaron autenticación y RLS.
          </label>
          <button
            className="primary"
            disabled={busy || !approved || plan.errors.length > 0}
            onClick={() => {
              void act("initial_import", {
                p_fingerprint: plan.fingerprint,
                p_participants: plan.participants,
                p_products: plan.products,
              })
                .then(() => {
                  setPlan(null);
                  setApproved(false);
                })
                .catch(() => {});
            }}
          >
            Importar registros validados
          </button>
        </>
      )}
    </section>
  );
}
function Account() {
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function update(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password !== repeat) {
      setError("Las contraseñas deben coincidir.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setRepeat("");
      setMessage("Contraseña actualizada correctamente.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Back to="/">Inicio</Back>
      <h1>Mi cuenta</h1>
      <form className="panel account-panel" onSubmit={update}>
        <h2>Actualizar contraseña</h2>
        <p>Usa una contraseña individual de al menos 12 caracteres.</p>
        <label>
          Nueva contraseña
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Repetir contraseña
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        {error && <Alert>{error}</Alert>}
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Actualizando…" : "Guardar contraseña"}
        </button>
      </form>
    </>
  );
}
