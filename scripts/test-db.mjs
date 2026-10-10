import { spawnSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  openSync,
  closeSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import pg from "pg";
const root = resolve("."),
  local = join(root, ".local"),
  cluster = join(local, "pg-test-cluster"),
  socketDir = join(local, "pg-test-sockets"),
  logPath = join(local, "postgres-test.log"),
  port = 55439;
const pgConfig = spawnSync("pg_config", ["--bindir"], {
  encoding: "utf8",
  windowsHide: true,
});
const bin =
  process.env.CAIE_PG_BIN ||
  (pgConfig.status === 0 && pgConfig.stdout.trim()) ||
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/15/bin"
    : "/usr/lib/postgresql/15/bin");
const exe = (name) =>
  join(bin, name + (process.platform === "win32" ? ".exe" : ""));
mkdirSync(local, { recursive: true });
function run(name, args) {
  // On Windows postgres can inherit pg_ctl's output handles. Use a file for
  // startup output so spawnSync does not wait for a pipe held by the server.
  const outputPath = join(local, "pg-ctl-start.log");
  const fd =
    name === "pg_ctl" && args.at(-1) === "start"
      ? openSync(outputPath, "w")
      : undefined;
  try {
    const r = spawnSync(exe(name), args, {
      encoding: "utf8",
      windowsHide: true,
      ...(fd === undefined ? {} : { stdio: ["ignore", fd, fd] }),
    });
    if (fd !== undefined) r.stdout = readFileSync(outputPath, "utf8");
    return r;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function command(name, args) {
  const r = run(name, args);
  if (r.error || r.status !== 0)
    throw new Error(
      `${exe(name)}: exit ${r.status}, signal ${r.signal ?? "none"}\n${r.error?.message ?? ""}\n${r.stdout ?? ""}${r.stderr ?? ""}`,
    );
  return r.stdout.trim();
}
function printLog() {
  if (!logPrepared) {
    console.error("PostgreSQL was not launched; no server log for this run.");
    return;
  }
  try {
    console.error(
      `--- ${logPath} (last 100 lines) ---\n${readFileSync(logPath, "utf8").split(/\r?\n/).slice(-100).join("\n")}`,
    );
  } catch (e) {
    console.error(`Unable to read PostgreSQL log: ${e.message}`);
  }
}
const db = "caie_test_" + randomUUID().replaceAll("-", ""),
  connection = { host: "127.0.0.1", port, user: "caie_test", database: db };
let master,
  pool,
  started = false,
  databaseCreated = false,
  logPrepared = false,
  engine = "PostgreSQL (version unavailable)";
const results = [];
try {
  const versions = ["postgres", "initdb", "pg_ctl"].map((name) =>
    command(name, ["--version"]),
  );
  const major = versions[0].match(/PostgreSQL\) (\d+)/)?.[1];
  if (
    !major ||
    Number(major) < 15 ||
    versions.some((v) => v.match(/PostgreSQL\) (\d+)/)?.[1] !== major)
  )
    throw new Error(
      `Expected matching PostgreSQL >=15 binaries: ${versions.join(", ")}`,
    );
  engine = `${versions[0]}; auth.uid shim local, sin servicio Supabase Auth`;
  console.log(`PostgreSQL binaries: ${bin}\n${versions.join("\n")}`);
  if (existsSync(cluster) && !existsSync(join(cluster, "CAIE_TEST_ONLY")))
    throw new Error("Refusing to use an unowned PostgreSQL cluster.");
  if (!existsSync(join(cluster, "PG_VERSION"))) {
    command("initdb", [
      "-D",
      cluster,
      "-U",
      "caie_test",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ]);
    writeFileSync(join(cluster, "CAIE_TEST_ONLY"), "Synthetic tests only");
  }
  if (readFileSync(join(cluster, "PG_VERSION"), "utf8").trim() !== major)
    throw new Error(
      "Test cluster version does not match PostgreSQL binaries; use a matching CAIE_PG_BIN.",
    );
  const status = run("pg_ctl", ["-D", cluster, "status"]);
  if (status.status !== 3)
    throw new Error(
      `Refusing to start an already running or inaccessible test cluster: ${status.stdout}${status.stderr}`,
    );
  // Never connect to another service that already owns the test port.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      probe.close((e) => (e ? reject(e) : resolve())),
    );
  });
  if (process.platform !== "win32") {
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    chmodSync(socketDir, 0o700);
  }
  writeFileSync(logPath, "");
  logPrepared = true;
  // Windows uses TCP only; Linux must not use the package's system socket directory.
  const options = `-p ${port} -h 127.0.0.1 -k "${process.platform === "win32" ? "" : socketDir}" -c unix_socket_permissions=0700`;
  try {
    command("pg_ctl", [
      "-D",
      cluster,
      "-l",
      logPath,
      "-o",
      options,
      "-w",
      "-t",
      "60",
      "start",
    ]);
    started = true;
  } catch (e) {
    // A startup timeout can leave a live server. Stop only our previously stopped cluster.
    started = run("pg_ctl", ["-D", cluster, "status"]).status === 0;
    throw e;
  }
  master = new pg.Client({
    ...connection,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });
  await master.connect();
  // Verify the instance before creating or modifying any database.
  assert.equal(
    resolve((await master.query("show data_directory")).rows[0].data_directory),
    cluster,
  );
  assert.equal(
    (await master.query("show unix_socket_directories")).rows[0]
      .unix_socket_directories,
    process.platform === "win32" ? "" : socketDir,
  );
  await master.query(`create database ${db}`);
  databaseCreated = true;
  pool = new pg.Pool({ ...connection, max: 12 });
  pool.on("error", () => {});
  await pool.query(
    `do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end$$; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  const migrationsDir = join(root, "supabase/migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const migration = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await pool.query(migration);
    } catch (e) {
      console.error(`Migration failed: ${file}`);
      if (e.position)
        console.error(
          "SQL near error:",
          migration.slice(Number(e.position) - 100, Number(e.position) + 100),
        );
      throw e;
    }
  }
  const admin = randomUUID(),
    operators = Array.from({ length: 5 }, randomUUID);
  const ids = {
    people: Array.from({ length: 6 }, randomUUID),
    products: Array.from({ length: 6 }, randomUUID),
    event: randomUUID(),
  };
  async function as(user, sql, params = []) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user || "",
      ]);
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async function anonymous(sql) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      return await c.query(sql);
    } finally {
      await c.query("rollback");
      c.release();
    }
  }
  async function seed({ stock = 20, balance = "20", price = "2" } = {}) {
    await pool.query(
      "truncate public.audit_log,public.import_batches,public.purchase_items,public.purchases,public.events,public.products,public.participants,public.profiles,auth.users restart identity cascade",
    );
    for (const [i, id] of [admin, ...operators].entries()) {
      await pool.query("insert into auth.users values($1)", [id]);
      await pool.query(
        "insert into public.profiles(id,display_name,role) values($1,$2,$3)",
        [id, `Usuario sintético ${i}`, i === 0 ? "admin" : "operator"],
      );
    }
    await pool.query(
      "insert into public.events(id,name,event_date,state) values($1,'Evento sintético','2026-10-09','active')",
      [ids.event],
    );
    for (const [i, id] of ids.people.entries())
      await pool.query(
        "insert into public.participants(id,name,group_name,balance) values($1,$2,'Pequeños',$3)",
        [id, `Participante sintético ${i}`, balance],
      );
    for (const [i, id] of ids.products.entries())
      await pool.query(
        "insert into public.products(id,name,category,price,stock) values($1,$2,'Hogar',$3,$4)",
        [id, `Producto sintético ${i}`, price, stock],
      );
  }
  const items = (product = ids.products[0], qty = 1, price = "2") => [
    { product_id: product, quantity: qty, expected_price: price },
  ];
  const buy = (
    user = operators[0],
    person = ids.people[0],
    products = items(),
    key = randomUUID(),
    event = ids.event,
  ) =>
    as(user, "select public.confirm_purchase($1,$2,$3,$4) result", [
      person,
      event,
      key,
      JSON.stringify(products),
    ]).then((r) => r[0].result);
  const balances = async () => {
    const p = await pool.query(
      "select balance::text from public.participants where id=$1",
      [ids.people[0]],
    );
    const i = await pool.query(
      "select stock from public.products where id=$1",
      [ids.products[0]],
    );
    const c = await pool.query("select count(*)::int n from public.purchases");
    return [p.rows[0].balance, i.rows[0].stock, c.rows[0].n];
  };
  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: "PASS" });
      console.log(`PASS ${name}`);
    } catch (e) {
      results.push({ name, status: "FAIL", error: e.message });
      console.error(`FAIL ${name}: ${e.stack}`);
    }
  }
  await test(`Migración completa sobre PostgreSQL ${major} real`, async () => {
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from pg_tables where schemaname='public'",
        )
      ).rows[0].n,
      8,
    );
  });
  await test("Compra de un artículo, saldo, inventario y Status", async () => {
    await seed();
    const r = await buy();
    assert.equal(r.total, "2.000");
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    const s = (await as(operators[0], "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      true,
    );
    assert.equal(s.purchases[0].items[0].unit_price, "2.000");
  });
  await test("Múltiples artículos y varias unidades", async () => {
    await seed();
    const r = await buy(operators[0], ids.people[0], [
      ...items(ids.products[0], 2),
      ...items(ids.products[1], 3),
    ]);
    assert.equal(r.total, "10.000");
    assert.deepEqual(await balances(), ["10.000", 18, 1]);
  });
  await test("Horas fraccionarias exactas", async () => {
    await seed({ balance: "0.3", price: "0.1" });
    const r = await buy(
      operators[0],
      ids.people[0],
      items(ids.products[0], 3, "0.1"),
    );
    assert.equal(r.balance_after, "0.000");
    assert.deepEqual(await balances(), ["0.000", 17, 1]);
  });
  for (const [name, setup, selection, message] of [
    [
      "Saldo insuficiente",
      () => seed({ balance: "1" }),
      () => items(),
      /Saldo insuficiente/,
    ],
    [
      "Precio NA",
      async () => {
        await seed();
        await pool.query("update public.products set price=null where id=$1", [
          ids.products[0],
        ]);
      },
      () => items(),
      /pendiente/,
    ],
    [
      "Inventario NA",
      async () => {
        await seed();
        await pool.query("update public.products set stock=null where id=$1", [
          ids.products[0],
        ]);
      },
      () => items(),
      /pendiente/,
    ],
    [
      "Precio alterado desde navegador",
      () => seed(),
      () => items(ids.products[0], 1, "0"),
      /precio/,
    ],
    [
      "Cantidad fraccionaria",
      () => seed(),
      () => items(ids.products[0], 1.5),
      /cantidades/,
    ],
    [
      "Productos duplicados",
      () => seed(),
      () => [...items(), ...items()],
      /repetidos/,
    ],
  ])
    await test(name, async () => {
      await setup();
      await assert.rejects(
        () => buy(operators[0], ids.people[0], selection()),
        message,
      );
      assert.equal(
        (await pool.query("select count(*)::int n from public.purchases"))
          .rows[0].n,
        0,
      );
    });
  await test("Stock cero y negativo: compra, reintento, auditoría y anulación", async () => {
    for (const stock of [1, 0, -2]) {
      await seed({ stock });
      const key = randomUUID();
      const purchase = await buy(
        operators[0],
        ids.people[0],
        items(ids.products[0], 2),
        key,
      );
      const retry = await buy(
        operators[0],
        ids.people[0],
        items(ids.products[0], 2),
        key,
      );
      assert.equal(retry.id, purchase.id);
      assert.deepEqual(await balances(), ["16.000", stock - 2, 1]);
      const snapshot = (await as(admin, "select public.export_snapshot() s"))[0]
        .s;
      assert.equal(
        snapshot.products.find((p) => p.id === ids.products[0]).stock,
        stock - 2,
      );
      assert.equal(
        snapshot.products.find((p) => p.id === ids.products[0]).availability,
        "review",
      );
      const audit = await pool.query(
        "select before_value,after_value from public.audit_log where table_name='products' and record_id=$1 and operation='UPDATE'",
        [ids.products[0]],
      );
      assert.equal(audit.rows[0].before_value.stock, stock);
      assert.equal(audit.rows[0].after_value.stock, stock - 2);
      await as(admin, "select public.cancel_purchase($1,$2)", [
        purchase.id,
        "Anulación de prueba",
      ]);
      assert.deepEqual(await balances(), ["20.000", stock, 1]);
    }
  });
  await test("Producto no listado: compra mixta, reintentos simultáneos, Excel y anulación", async () => {
    await seed();
    const id = randomUUID(),
      key = randomUUID();
    const selection = [
      ...items(ids.products[0], 1),
      {
        product_id: id,
        quantity: 2,
        expected_price: "1.5",
        new_product: true,
        new_name: "Bolsa nueva sintética",
        new_category: "Hogar",
      },
    ];
    const receipts = await Promise.all(
      Array.from({ length: 3 }, () =>
        buy(operators[0], ids.people[0], selection, key),
      ),
    );
    assert.ok(receipts.every((r) => r.id === receipts[0].id));
    assert.equal(receipts[0].total, "5.000");
    assert.deepEqual(await balances(), ["15.000", 19, 1]);
    const snapshot = (await as(admin, "select public.export_snapshot() s"))[0]
      .s;
    assert.equal(snapshot.products.find((p) => p.id === id).stock, -2);
    assert.equal(
      snapshot.purchases[0].items.find((i) => i.product_id === id).product_name,
      "Bolsa nueva sintética",
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_log where record_id=$1 and operation='INSERT'",
          [id],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      () =>
        buy(
          operators[0],
          ids.people[0],
          [{ ...selection[1], new_name: "Nombre cambiado" }],
          key,
        ),
      /otra operación/,
    );
    await as(admin, "select public.cancel_purchase($1,$2)", [
      receipts[0].id,
      "Anulación sintética",
    ]);
    assert.equal(
      (await pool.query("select stock from public.products where id=$1", [id]))
        .rows[0].stock,
      0,
    );
    assert.deepEqual(await balances(), ["20.000", 20, 1]);
  });
  await test("Producto no listado: errores revierten alta, auditoría y compra", async () => {
    await seed({ balance: "1" });
    const id = randomUUID();
    const selection = [
      {
        product_id: id,
        quantity: 1,
        expected_price: "2",
        new_product: true,
        new_name: "Producto sintético",
        new_category: "Hogar",
      },
    ];
    await assert.rejects(
      () => buy(operators[0], ids.people[0], selection),
      /Saldo insuficiente/,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.products where id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_log where record_id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      () =>
        buy(operators[0], ids.people[0], [{ ...selection[0], new_name: "  " }]),
      /nombre y categoría/,
    );
    await assert.rejects(
      () =>
        buy(operators[0], ids.people[0], [
          { ...selection[0], expected_price: "-1" },
        ]),
      /horas|Horas/,
    );
    await assert.rejects(
      () =>
        buy(operators[0], ids.people[0], [
          { ...selection[0], product_id: ids.products[0] },
        ]),
      /ya existe/,
    );
    assert.deepEqual(await balances(), ["1.000", 20, 0]);
  });
  await test("Segunda compra del mismo participante permitida", async () => {
    await seed();
    await buy();
    await buy();
    assert.deepEqual(await balances(), ["16.000", 18, 2]);
  });
  await test("Anulación atómica, restitución, Status y doble anulación", async () => {
    await seed();
    const r = await buy();
    await as(admin, "select public.cancel_purchase($1,$2)", [
      r.id,
      "Captura incorrecta",
    ]);
    assert.deepEqual(await balances(), ["20.000", 20, 1]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      false,
    );
    assert.equal(s.purchases[0].state, "cancelled");
    await assert.rejects(
      () =>
        as(admin, "select public.cancel_purchase($1,$2)", [r.id, "Repetición"]),
      /ya fue anulada/,
    );
  });
  await test("Anular una compra conserva Status si hay otra vigente", async () => {
    await seed();
    const r = await buy();
    await buy();
    await as(admin, "select public.cancel_purchase($1,$2)", [
      r.id,
      "Captura incorrecta",
    ]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      true,
    );
  });
  await test("Nuevo evento reinicia Status y conserva saldos e inventario", async () => {
    await seed();
    await buy();
    await as(admin, "select public.admin_event($1,null,null,'close')", [
      ids.event,
    ]);
    const next = (
      await as(
        admin,
        "select public.admin_event(null,'Siguiente','2026-10-10','create') id",
      )
    )[0].id;
    await as(admin, "select public.admin_event($1,null,null,'activate')", [
      next,
    ]);
    const s = (await as(admin, "select public.app_snapshot() s"))[0].s;
    assert.equal(
      s.participants.find((p) => p.id === ids.people[0]).purchased,
      false,
    );
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_event(null,'Otro','2026-10-10','create') id",
        ).then(async (r) =>
          as(admin, "select public.admin_event($1,null,null,'activate')", [
            r[0].id,
          ]),
        ),
      /Cierra el evento/,
    );
  });
  await test("A: dos operadores descuentan última unidad y generan negativo", async () => {
    await seed({ stock: 1 });
    const r = await Promise.allSettled([
      buy(operators[0], ids.people[0]),
      buy(operators[1], ids.people[1]),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 2);
    assert.equal((await balances())[1], -1);
  });
  await test("B: dos operadores compiten por últimas horas", async () => {
    await seed({ balance: "2" });
    const r = await Promise.allSettled([buy(operators[0]), buy(operators[1])]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.deepEqual(await balances(), ["0.000", 19, 1]);
  });
  await test("C: cinco operadores simultáneos sin actualizaciones perdidas", async () => {
    await seed();
    await Promise.all(operators.map((u, i) => buy(u, ids.people[i])));
    assert.equal((await balances())[1], 15);
    assert.equal((await balances())[2], 5);
    assert.equal(
      (await pool.query("select sum(balance)::text s from public.participants"))
        .rows[0].s,
      "110.000",
    );
  });
  await test("Cinco sesiones de la misma cuenta CAIE conservan consistencia", async () => {
    await seed();
    await Promise.all(
      ids.people.slice(0, 5).map((person) => buy(operators[0], person)),
    );
    assert.equal((await balances())[1], 15);
    assert.equal((await balances())[2], 5);
  });
  await test("D: doble confirmación concurrente idempotente", async () => {
    await seed();
    const key = randomUUID();
    const r = await Promise.all([
      buy(operators[0], ids.people[0], items(), key),
      buy(operators[0], ids.people[0], items(), key),
    ]);
    assert.equal(r[0].id, r[1].id);
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    await assert.rejects(
      () => buy(operators[0], ids.people[0], items(ids.products[0], 2), key),
      /otra operación/,
    );
  });
  await test("E: respuesta descartada después de commit; reintento recupera resultado", async () => {
    await seed();
    const key = randomUUID();
    await buy(operators[0], ids.people[0], items(), key);
    const recovered = await buy(operators[0], ids.people[0], items(), key);
    assert.ok(recovered.id);
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
  });
  await test("F: fallo inyectado después de descuentos revierte toda la transacción", async () => {
    await seed();
    await pool.query(
      `create function public.inject_test_failure() returns trigger language plpgsql as $$begin raise exception 'Fallo inyectado';end$$;create trigger fail_late after update on public.participants for each row execute function public.inject_test_failure()`,
    );
    const before = (
      await pool.query("select count(*)::int n from public.audit_log")
    ).rows[0].n;
    await assert.rejects(() => buy(), /Fallo inyectado/);
    assert.deepEqual(await balances(), ["20.000", 20, 0]);
    assert.equal(
      (await pool.query("select count(*)::int n from public.audit_log")).rows[0]
        .n,
      before,
    );
    await pool.query(
      "drop trigger fail_late on public.participants;drop function public.inject_test_failure()",
    );
  });
  await test("Carritos opuestos no causan deadlock", async () => {
    await seed();
    await Promise.all([
      buy(operators[0], ids.people[0], [
        ...items(ids.products[0]),
        ...items(ids.products[1]),
      ]),
      buy(operators[1], ids.people[1], [
        ...items(ids.products[1]),
        ...items(ids.products[0]),
      ]),
    ]);
    assert.equal((await balances())[2], 2);
  });
  await test("Anónimo no lee participantes ni compras ni ejecuta RPC", async () => {
    await seed();
    for (const sql of [
      "select * from public.participants",
      "select * from public.purchases",
      "select public.app_snapshot()",
    ])
      await assert.rejects(() => anonymous(sql), /permission denied/);
  });
  await test("Operador no modifica directamente saldos, precios ni permisos", async () => {
    await seed();
    for (const sql of [
      "update public.participants set balance=999",
      "update public.products set price=0",
      "update public.profiles set role='admin'",
    ])
      await assert.rejects(() => as(operators[0], sql), /permission denied/);
  });
  await test("RLS rechaza lectura por usuario sin perfil y perfil desactivado", async () => {
    await seed();
    assert.equal(
      (await as(randomUUID(), "select * from public.participants")).length,
      0,
    );
    await pool.query("update public.profiles set active=false where id=$1", [
      operators[0],
    ]);
    assert.equal(
      (await as(operators[0], "select * from public.participants")).length,
      0,
    );
    await assert.rejects(() => buy(), /autorización/);
  });
  await test("RPC administrativas y exportación restringidas", async () => {
    await seed();
    for (const sql of [
      "select public.export_snapshot()",
      `select public.admin_event(null,'No autorizado','2026-10-09','create')`,
      `select public.initial_import(repeat('a',64),'[]','[]')`,
    ])
      await assert.rejects(() => as(operators[0], sql), /autorización/);
    assert.ok(
      (await as(admin, "select public.export_snapshot() s"))[0].s.participants
        .length,
    );
  });
  await test("Alta de participante con saldo exacto y auditoría", async () => {
    await seed();
    await as(admin, "select public.admin_participant(null,$1,$2,$3,$4,null)", [
      "Nueva persona sintética",
      "Grandes",
      "12.345",
      "Registro inicial",
    ]);
    const created = await pool.query(
      "select balance::text from public.participants where name=$1",
      ["Nueva persona sintética"],
    );
    assert.equal(created.rows[0].balance, "12.345");
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_log where reason='Registro inicial' and table_name='participants'",
        )
      ).rows[0].n,
      1,
    );
  });
  await test("Operador y anónimo no dan de alta participantes", async () => {
    await seed();
    const sql =
      "select public.admin_participant(null,'Persona sintética','Grandes','4','Registro inicial',null)";
    await assert.rejects(() => as(operators[0], sql), /autorización/);
    await assert.rejects(() => anonymous(sql), /permission denied/);
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      6,
    );
  });
  await test("Alta inválida no cambia participantes ni auditoría", async () => {
    await seed();
    const before = (
      await pool.query("select count(*)::int n from public.audit_log")
    ).rows[0].n;
    for (const [name, group, balance] of [
      ["", "Grandes", "1"],
      ["X", "Desconocido", "1"],
      ["X", "Grandes", "-1"],
    ])
      await assert.rejects(() =>
        as(
          admin,
          "select public.admin_participant(null,$1,$2,$3,'Registro inicial',null)",
          [name, group, balance],
        ),
      );
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      6,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.audit_log")).rows[0]
        .n,
      before,
    );
  });
  await test("Ajuste de horas auditado y formulario obsoleto rechazado", async () => {
    await seed();
    await as(
      admin,
      "select public.admin_participant($1,'Corregido','Mamás','21','Ajuste educativo','20')",
      [ids.people[0]],
    );
    assert.equal((await balances())[0], "21.000");
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_participant($1,'Corregido','Mamás','22','Ajuste educativo','20')",
          [ids.people[0]],
        ),
      /saldo cambió/,
    );
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.audit_log where reason='Ajuste educativo'",
        )
      ).rows[0].n,
      1,
    );
  });
  await test("Ajuste de producto y protección contra existencias obsoletas", async () => {
    await seed();
    await as(
      admin,
      "select public.admin_product($1,'Corregido','Hogar','3',25,true,'Reabastecimiento',20,'2')",
      [ids.products[0]],
    );
    assert.equal((await balances())[1], 25);
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_product($1,'Corregido','Hogar','3',30,true,'Reabastecimiento',20,'2')",
          [ids.products[0]],
        ),
      /producto cambió/,
    );
    await assert.rejects(
      () =>
        as(
          admin,
          "select public.admin_product($1,'Corregido','Hogar','3',null,true,'Borrar inventario',25,'3')",
          [ids.products[0]],
        ),
      /borrar/,
    );
  });
  await test("Importación inicial y reimportación sin sobrescribir compras", async () => {
    await seed();
    await pool.query(
      "truncate public.purchase_items,public.purchases,public.products,public.participants cascade",
    );
    const people = [
        {
          name: "Persona sintética",
          group_name: "Mamás",
          balance: "12",
          original_status: null,
        },
      ],
      products = [
        {
          name: "Producto sintético",
          category: "Hogar",
          price: "2",
          stock: 10,
        },
        {
          name: "Precio pendiente",
          category: "Juguetes",
          price: null,
          stock: 3,
        },
        {
          name: "Stock pendiente",
          category: "Juguetes",
          price: "1",
          stock: null,
        },
      ];
    const params = [
      "a".repeat(64),
      JSON.stringify(people),
      JSON.stringify(products),
    ];
    const r = (
      await as(admin, "select public.initial_import($1,$2,$3) r", params)
    )[0].r;
    assert.equal(r.participants_imported, 1);
    const p = (await pool.query("select id from public.participants")).rows[0]
        .id,
      prod = (
        await pool.query(
          "select id from public.products where name='Producto sintético'",
        )
      ).rows[0].id;
    await buy(operators[0], p, items(prod));
    const repeated = (
      await as(admin, "select public.initial_import($1,$2,$3) r", params)
    )[0].r;
    assert.equal(repeated.already_imported, true);
    assert.equal(
      (await pool.query("select balance::text from public.participants"))
        .rows[0].balance,
      "10.000",
    );
    await assert.rejects(
      () =>
        as(admin, "select public.initial_import($1,$2,$3)", [
          "b".repeat(64),
          params[1],
          params[2],
        ]),
      /cerrada/,
    );
  });
  await test("Importación ambigua o inválida revierte todos los registros", async () => {
    await seed();
    await pool.query(
      "truncate public.purchase_items,public.purchases,public.products,public.participants cascade",
    );
    const p = [
      { name: "  José Ejemplo ", group_name: "Grandes", balance: "4" },
      { name: "Jose  Ejemplo", group_name: "Grandes", balance: "4" },
    ];
    await assert.rejects(
      () =>
        as(admin, "select public.initial_import($1,$2,$3)", [
          "c".repeat(64),
          JSON.stringify(p),
          JSON.stringify([
            { name: "X", category: "Hogar", price: "1", stock: 2 },
          ]),
        ]),
      /ambiguos/,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      0,
    );
  });
  await test("Exportación snapshot consistente durante cinco compras", async () => {
    await seed();
    const all = await Promise.all([
      ...operators.map((u, i) => buy(u, ids.people[i])),
      as(admin, "select public.export_snapshot() s"),
    ]);
    const s = all.at(-1)[0].s;
    const sold = s.purchases.length;
    assert.equal(
      s.products.find((p) => p.id === ids.products[0]).stock,
      20 - sold,
    );
    assert.equal(
      s.participants.reduce((v, p) => v + Number(p.balance), 0),
      120 - sold * 2,
    );
  });
  const publicActor = "aaca1e00-0000-4000-8000-000000000001";
  async function enablePublic() {
    await pool.query("insert into auth.users(id) values($1)", [publicActor]);
    await pool.query(
      "insert into public.profiles(id,display_name,role) values($1,'Acceso público','admin')",
      [publicActor],
    );
    await pool.query(
      "insert into caie_private.store_access(singleton,enabled,actor_id) values(true,true,$1)",
      [publicActor],
    );
  }
  async function openStore(operation, params = {}) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      const result = await c.query("select public.open_store($1,$2) result", [
        operation,
        JSON.stringify(params),
      ]);
      assert.equal(
        (
          await c.query(
            "select nullif(current_setting('request.jwt.claim.sub',true),'') sub",
          )
        ).rows[0].sub,
        null,
      );
      await c.query("commit");
      return result.rows[0].result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  const publicBuy = (person = ids.people[0], key = randomUUID()) =>
    openStore("confirm_purchase", {
      p_participant: person,
      p_event: ids.event,
      p_key: key,
      p_items: items(),
    });
  await test("Página pública obtiene registros y exportación sin sesión", async () => {
    await seed();
    await enablePublic();
    const snapshot = await openStore("app_snapshot");
    assert.equal(snapshot.profile.display_name, "Acceso público");
    assert.equal(snapshot.participants.length, 6);
    assert.equal(snapshot.products.length, 6);
    assert.equal((await openStore("export_snapshot")).participants.length, 6);
  });
  await test("Acceso público añade participantes y productos con saldo exacto y auditoría", async () => {
    await seed();
    await enablePublic();
    await openStore("admin_participant", {
      p_id: null,
      p_name: "Nueva persona pública sintética",
      p_group: "Grandes",
      p_balance: "12.345",
      p_reason: "Registro inicial",
      p_expected_balance: null,
    });
    const product = await openStore("admin_product", {
      p_id: null,
      p_name: "Producto público sintético",
      p_category: "Hogar",
      p_price: "1.125",
      p_stock: 7,
      p_active: true,
      p_reason: "Registro inicial",
      p_expected_stock: null,
      p_expected_price: null,
    });
    assert.match(product, /^[0-9a-f-]{36}$/);
    const snapshot = await openStore("app_snapshot");
    assert.equal(
      snapshot.participants.find(
        (p) => p.name === "Nueva persona pública sintética",
      ).balance,
      "12.345",
    );
    assert.equal(
      snapshot.products.find((p) => p.id === product).price,
      "1.125",
    );
    assert.equal(
      snapshot.audit.filter(
        (a) => a.reason === "Registro inicial" && a.actor_id === publicActor,
      ).length,
      2,
    );
  });
  await test("Compra pública conserva atomicidad, idempotencia y anulación exacta", async () => {
    await seed();
    await enablePublic();
    const key = randomUUID();
    const first = await publicBuy(ids.people[0], key);
    const retry = await publicBuy(ids.people[0], key);
    assert.equal(first.id, retry.id);
    assert.deepEqual(await balances(), ["18.000", 19, 1]);
    await openStore("cancel_purchase", {
      p_purchase: first.id,
      p_reason: "Anulación sintética",
    });
    assert.deepEqual(await balances(), ["20.000", 20, 1]);
    await assert.rejects(
      () =>
        openStore("cancel_purchase", {
          p_purchase: first.id,
          p_reason: "Reintento sintético",
        }),
      /ya fue anulada/,
    );
    const purchase = (
      await pool.query(
        "select operator_id,cancelled_by from public.purchases where id=$1",
        [first.id],
      )
    ).rows[0];
    assert.equal(purchase.operator_id, publicActor);
    assert.equal(purchase.cancelled_by, publicActor);
  });
  await test("Cinco teléfonos públicos concurrentes conservan inventario y saldos", async () => {
    await seed({ stock: 3 });
    await enablePublic();
    const results = await Promise.allSettled(
      ids.people.slice(0, 5).map((id) => publicBuy(id)),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal(results.filter((r) => r.status === "rejected").length, 0);
    assert.equal(
      (
        await pool.query("select stock from public.products where id=$1", [
          ids.products[0],
        ])
      ).rows[0].stock,
      -2,
    );
    assert.equal(
      (
        await pool.query(
          "select sum(balance)::text total from public.participants",
        )
      ).rows[0].total,
      "110.000",
    );
  });
  await test("Operación pública inválida hace rollback sin alterar saldos, existencias ni auditoría", async () => {
    await seed({ balance: "1" });
    await enablePublic();
    const before = (
      await pool.query("select count(*)::int n from public.audit_log")
    ).rows[0].n;
    await assert.rejects(() => publicBuy(), /Saldo insuficiente/);
    assert.deepEqual(await balances(), ["1.000", 20, 0]);
    assert.equal(
      (await pool.query("select count(*)::int n from public.audit_log")).rows[0]
        .n,
      before,
    );
    await assert.rejects(
      () =>
        openStore("admin_participant", {
          p_name: "Inválida",
          p_group: "Grandes",
          p_balance: "-1",
          p_reason: "Registro inicial",
        }),
      /decimal no negativo/,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      6,
    );
  });
  await test("Acceso público conserva RLS y no expone configuración ni gestión de cuentas", async () => {
    await seed();
    await enablePublic();
    for (const sql of [
      "select * from caie_private.store_access",
      "update public.participants set balance=999",
      "update public.profiles set role='admin'",
      "select public.require_role(true)",
      "select public.app_snapshot()",
    ])
      await assert.rejects(() => anonymous(sql), /permission denied/);
    await assert.rejects(
      () => openStore("admin_profile", { p_id: operators[0], p_role: "admin" }),
      /no disponible/,
    );
    await assert.rejects(
      () =>
        openStore("arbitrary_sql", { sql: "delete from public.participants" }),
      /no disponible/,
    );
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [
          operators[0],
          JSON.stringify({ sub: operators[0], role: "authenticated" }),
        ],
      );
      await c.query("select public.open_store('app_snapshot')");
      assert.equal(
        (await c.query("select auth.uid() id")).rows[0].id,
        operators[0],
      );
      assert.equal(
        (await c.query("select current_setting('request.jwt.claims') claims"))
          .rows[0].claims,
        JSON.stringify({ sub: operators[0], role: "authenticated" }),
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
  await test("Se puede cerrar el acceso público desde configuración privada", async () => {
    await seed();
    await enablePublic();
    await pool.query("update caie_private.store_access set enabled=false");
    await assert.rejects(() => openStore("app_snapshot"), /está cerrado/);
    await assert.rejects(() => publicBuy(), /está cerrado/);
    assert.deepEqual(await balances(), ["20.000", 20, 0]);
    assert.equal(
      (await as(admin, "select public.app_snapshot() s"))[0].s.participants
        .length,
      6,
    );
  });
  await test("Gestión pública de eventos mantiene exclusividad e importación no reemplaza datos", async () => {
    await seed();
    await enablePublic();
    const pending = await openStore("admin_event", {
      p_id: null,
      p_name: "Evento público sintético",
      p_date: "2026-10-10",
      p_action: "create",
    });
    await assert.rejects(
      () => openStore("admin_event", { p_id: pending, p_action: "activate" }),
      /Cierra el evento activo/,
    );
    await openStore("admin_event", { p_id: ids.event, p_action: "close" });
    await openStore("admin_event", { p_id: pending, p_action: "activate" });
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from public.events where state='active'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      () =>
        openStore("initial_import", {
          p_fingerprint: "f".repeat(64),
          p_participants: [],
          p_products: [],
        }),
      /importación inicial está cerrada/,
    );
    assert.equal(
      (await pool.query("select count(*)::int n from public.participants"))
        .rows[0].n,
      6,
    );
  });
  await test("Todas las tablas protegidas con RLS y SECURITY DEFINER con search_path vacío", async () => {
    const tables = await pool.query(
      "select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'",
    );
    assert.ok(tables.rows.every((r) => r.relrowsecurity));
    const f = await pool.query(
      "select proname,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef",
    );
    assert.ok(f.rows.every((r) => r.proconfig?.includes('search_path=\"\"')));
  });
} catch (e) {
  results.push({
    name: "Infraestructura local PostgreSQL",
    status: "FAIL",
    error: e.stack,
  });
  console.error(e.stack);
  printLog();
} finally {
  async function cleanup(name, fn) {
    try {
      await fn();
    } catch (e) {
      results.push({
        name: `Limpieza: ${name}`,
        status: "FAIL",
        error: e.stack,
      });
      console.error(`Cleanup failed (${name}): ${e.stack}`);
      printLog();
    }
  }
  if (pool) await cleanup("pool", () => pool.end());
  if (master) {
    if (databaseCreated)
      await cleanup("base sintética", () =>
        master.query(`drop database if exists ${db} with (force)`),
      );
    await cleanup("conexión", () => master.end());
  }
  if (started)
    await cleanup("servidor", () =>
      command("pg_ctl", [
        "-D",
        cluster,
        "-m",
        "fast",
        "-w",
        "-t",
        "60",
        "stop",
      ]),
    );
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "docs/db-test-results.json"),
    JSON.stringify(
      {
        executed_at: new Date().toISOString(),
        engine,
        results,
      },
      null,
      2,
    ),
  );
}
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
